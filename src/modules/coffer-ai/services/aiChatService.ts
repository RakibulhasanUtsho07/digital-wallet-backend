import {
  createHash,
  randomUUID,
} from "node:crypto";

import type { CofferAiConfig } from "../config/cofferAiConfig.js";
import { resolveAiActorContext } from "../context/aiActorContextService.js";
import { CofferAiError } from "../errors/cofferAiError.js";
import { classifyAiIntent } from "../intents/aiIntentClassifier.js";
import type {
  AiKnowledgeService,
  AiKnowledgeSnippet,
} from "../knowledge/aiKnowledgeService.js";
import { knowledgeAudienceForActor } from "../learning/aiKnowledgeLearningService.js";
import { responseStyleForActor } from "../learning/aiResponseLearningService.js";
import type {
  AiConversationContext,
  AiConversationContextService,
} from "../memory/aiConversationContextService.js";
import { evaluateAiPolicy } from "../policies/aiPolicyEngine.js";
import {
  transientAiConversationStore,
  type AiConversationStore,
} from "../persistence/aiConversationStore.js";
import { sanitizeAiText } from "../privacy/aiPrivacySanitizer.js";
import {
  detectAiResponseScope,
  type AiResponseComposer,
  type AiResponseScope,
} from "./aiResponseComposer.js";
import type { AiToolRegistry } from "../tools/aiToolRegistry.js";
import type {
  AiActorContext,
  AiAuditEvent,
  AiAuditSink,
  AiChatRequestInput,
  AiChatResponseData,
  AiChatResult,
  AiIntent,
  AiIntentClassification,
  AiSourceReference,
  AiToolId,
  AiToolResult,
  AiTrustedRequestSource,
} from "../types/cofferAi.types.js";

export interface AiChatService {
  chat(input: {
    requestId: string;
    source: AiTrustedRequestSource;
    body: AiChatRequestInput;
  }): Promise<AiChatResult>;
}

function actorReference(actor: AiActorContext): string | null {
  const identifier = actor.merchantId ?? actor.userId;
  if (!identifier) return null;
  return createHash("sha256").update(identifier).digest("hex").slice(0, 20);
}

function statusForPolicyReason(reasonCode: string): number {
  if (reasonCode === "AUTH_REQUIRED") return 401;
  if (reasonCode === "FEATURE_DISABLED") return 503;
  if (
    reasonCode === "INTENT_NOT_SUPPORTED" ||
    reasonCode === "CLARIFICATION_REQUIRED"
  ) {
    return 422;
  }
  return 403;
}

function toolForIntent(intent: AiIntent): AiToolId | null {
  const map: Partial<Record<AiIntent, AiToolId>> = {
    payment_diagnosis: "user.payment.timeline",
    wallet_summary: "user.wallet.summary",
    kyc_status: "user.kyc.status",
    transaction_lookup: "user.transaction.detail",
    transfer_diagnosis: "user.transaction.detail",
    receipt_lookup: "user.receipt.detail",
    security_summary: "user.security.summary",
    merchant_payment_diagnosis: "merchant.payment.timeline",
    merchant_overview: "merchant.overview",
    merchant_refund_summary: "merchant.refunds.summary",
    merchant_payout_summary: "merchant.payouts.summary",
    merchant_settlement_summary: "merchant.settlements.summary",
    merchant_webhook_summary: "merchant.webhooks.summary",
    merchant_api_key_summary: "merchant.api_keys.summary",
    merchant_analytics_summary: "merchant.analytics.summary",
    merchant_refund_diagnosis: "merchant.refund.diagnosis",
    merchant_payout_diagnosis: "merchant.payout.diagnosis",
    merchant_settlement_diagnosis: "merchant.settlement.diagnosis",
    merchant_webhook_diagnosis: "merchant.webhook.diagnosis",
    merchant_api_key_diagnosis: "merchant.api_key.diagnosis",
    support_investigation: "support.investigate",
    support_operations_summary: "support.operations.summary",
    analyst_wallet_snapshot: "analyst.wallet.snapshot",
    analyst_payment_snapshot: "analyst.payment.snapshot",
    analyst_risk_snapshot: "analyst.risk.snapshot",
    analyst_revenue_snapshot: "analyst.revenue.snapshot",
    admin_platform_overview: "admin.platform.overview",
    admin_risk_snapshot: "admin.risk.snapshot",
    admin_finance_snapshot: "admin.finance.snapshot",
  };

  return map[intent] ?? null;
}

function validateServiceInput(
  config: CofferAiConfig,
  body: AiChatRequestInput,
): void {
  if (
    typeof body.message !== "string" ||
    body.message.trim().length === 0 ||
    body.message.trim().length > config.maxMessageLength
  ) {
    throw new CofferAiError({
      code: "AI_MESSAGE_INVALID",
      message: `Message must contain between 1 and ${config.maxMessageLength} characters.`,
      statusCode: 400,
    });
  }

  if (
    body.conversationId !== undefined &&
    (
      typeof body.conversationId !== "string" ||
      body.conversationId.trim().length === 0 ||
      body.conversationId.trim().length > 160 ||
      !/^[a-zA-Z0-9_-]+$/.test(body.conversationId.trim())
    )
  ) {
    throw new CofferAiError({
      code: "AI_CONVERSATION_ID_INVALID",
      message: "Conversation ID is invalid.",
      statusCode: 400,
    });
  }

  const route = body.pageContext?.route;

  if (
    route !== undefined &&
    (
      typeof route !== "string" ||
      route.length > 240 ||
      !route.startsWith("/") ||
      /[\u0000-\u001f\u007f]/.test(route)
    )
  ) {
    throw new CofferAiError({
      code: "AI_PAGE_CONTEXT_INVALID",
      message: "Page context is invalid.",
      statusCode: 400,
    });
  }

  const resourceId = body.pageContext?.resourceId;

  if (
    resourceId !== undefined &&
    (
      typeof resourceId !== "string" ||
      resourceId.trim().length > 128 ||
      /[\u0000-\u001f\u007f]/.test(resourceId)
    )
  ) {
    throw new CofferAiError({
      code: "AI_RESOURCE_CONTEXT_INVALID",
      message: "Resource context is invalid.",
      statusCode: 400,
    });
  }
}

function looksLikeFollowUp(message: string): boolean {
  const value = message.trim().toLowerCase();

  if (value.length > 180) return false;

  return (
    /^(and|then|so|now|what about|what should|why|how about|tell me more|check that|check it)\b/.test(value) ||
    /^(এখন|তাহলে|তারপর|এটা|ওটা|এটার|ওটার|কি বলব|কী বলব|আরও|কেন|কিভাবে)/.test(value)
  );
}

function contextualizeClassification(input: {
  classification: AiIntentClassification;
  context: AiConversationContext;
  message: string;
}): AiIntentClassification {
  let next = input.classification;

  if (
    next.intent === "unknown" &&
    input.context.lastIntent &&
    input.context.lastIntent !== "unknown" &&
    looksLikeFollowUp(input.message)
  ) {
    next = {
      ...next,
      intent: input.context.lastIntent,
      confidence: "medium",
      needsClarification: false,
      reasonCode: "CONVERSATION_FOLLOW_UP",
    };
  }

  const canReuseResource =
    next.intent === "payment_diagnosis" ||
    next.intent === "transaction_lookup" ||
    next.intent === "transfer_diagnosis" ||
    next.intent === "receipt_lookup" ||
    next.intent === "merchant_payment_diagnosis" ||
    next.intent === "merchant_refund_diagnosis" ||
    next.intent === "merchant_payout_diagnosis" ||
    next.intent === "merchant_settlement_diagnosis" ||
    next.intent === "merchant_webhook_diagnosis" ||
    next.intent === "merchant_api_key_diagnosis" ||
    next.intent === "support_investigation";

  const sameIntentAsPrevious =
    Boolean(input.context.lastIntent) &&
    next.intent === input.context.lastIntent;

  if (
    canReuseResource &&
    sameIntentAsPrevious &&
    !next.resourceId &&
    input.context.lastResourceId &&
    looksLikeFollowUp(input.message)
  ) {
    next = {
      ...next,
      resourceId: input.context.lastResourceId,
      confidence:
        next.confidence === "low"
          ? "medium"
          : next.confidence,
      needsClarification: false,
      reasonCode: "CONVERSATION_RESOURCE_REUSED",
    };
  }

  return next;
}

function uniqueSources(
  sources: ReadonlyArray<AiSourceReference>,
): AiSourceReference[] {
  const seen = new Set<string>();
  const result: AiSourceReference[] = [];

  for (const source of sources) {
    const key = `${source.type}:${source.reference}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(source);
  }

  return result;
}

function shouldSearchKnowledge(
  intent: AiIntent,
  actorType: AiActorContext["actorType"],
): boolean {
  return knowledgeAudienceForActor(actorType) !== null && toolForIntent(intent) !== null;
}


function shouldUseKnowledgeForScope(
  scope: AiResponseScope,
): boolean {
  return (
    scope === "full" ||
    scope === "knowledge" ||
    scope === "workflow"
  );
}

function suggestedActionsForScope(
  scope: AiResponseScope,
  actions: AiToolResult["suggestedActions"],
): AiToolResult["suggestedActions"] {
  if (
    scope === "evidence_only" ||
    scope === "knowledge" ||
    scope === "customer_reply"
  ) {
    return [];
  }

  if (scope === "lookup_requirements") {
    return actions.filter((action) =>
      /provide|payment id|transaction id|customer|reference|lookup/i.test(
        action.label,
      ),
    );
  }

  if (scope === "escalation") {
    return actions.filter((action) =>
      /escalat|provider handoff|case workspace|provider review/i.test(
        action.label,
      ),
    );
  }

  return actions;
}

function factsForScope(
  scope: AiResponseScope,
  facts: AiToolResult["facts"],
): AiToolResult["facts"] {
  if (
    scope === "customer_reply" ||
    scope === "lookup_requirements"
  ) {
    return [];
  }

  return facts;
}

interface SanitizerState {
  detections: number;
}

const REDACTED_VALUE = "[redacted]";

const SENSITIVE_STRUCTURED_KEYS = new Set([
  "password",
  "passwordhash",
  "passwordresettoken",
  "passcode",
  "pin",
  "otp",
  "otphash",
  "codehash",
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "apisecret",
  "clientsecret",
  "secret",
  "secrethash",
  "signingsecret",
  "signingsecretencrypted",
  "privatekey",
  "authorization",
  "cookie",
  "setcookie",
  "sessionid",
  "ip",
  "ipaddress",
  "maskedip",
  "cardnumber",
  "fullcardnumber",
  "cvv",
  "cvc",
  "documentnumber",
  "documentnumberencrypted",
  "documentnumberlookup",
  "identifierlookup",
  "faceembeddingencrypted",
  "requestbody",
  "responsebody",
  "rawbody",
  "rawheaders",
]);

function normalizedStructuredKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isSensitiveStructuredKey(key: string): boolean {
  return SENSITIVE_STRUCTURED_KEYS.has(
    normalizedStructuredKey(key),
  );
}

function sanitizeString(
  value: string,
  state: SanitizerState,
): string {
  const sanitized = sanitizeAiText(value);
  state.detections += sanitized.detections.length;
  return sanitized.content;
}

function sanitizeUnknownValue(
  value: unknown,
  state: SanitizerState,
  depth = 0,
): unknown {
  if (depth > 8) {
    state.detections += 1;
    return REDACTED_VALUE;
  }

  if (typeof value === "string") {
    return sanitizeString(value, state);
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      sanitizeUnknownValue(
        item,
        state,
        depth + 1,
      ),
    );
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};

    for (const [
      key,
      nestedValue,
    ] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (isSensitiveStructuredKey(key)) {
        output[key] = REDACTED_VALUE;
        state.detections += 1;
        continue;
      }

      output[key] = sanitizeUnknownValue(
        nestedValue,
        state,
        depth + 1,
      );
    }

    return output;
  }

  return String(value);
}

function sanitizeConversationContext(
  context: AiConversationContext,
): {
  context: AiConversationContext;
  detections: number;
} {
  let detections = 0;

  const messages = context.messages.map(
    (message) => {
      const sanitized =
        sanitizeAiText(
          message.content,
        );

      detections +=
        sanitized.detections.length;

      return {
        ...message,
        content:
          sanitized.content,
      };
    },
  );

  return {
    detections,
    context: {
      ...context,
      messages,
    },
  };
}

function sanitizeToolResult(
  result: AiToolResult,
): {
  result: AiToolResult;
  detections: number;
} {
  const state: SanitizerState = {
    detections: 0,
  };

  const facts = result.facts.map((fact) => ({
    label: sanitizeString(
      fact.label,
      state,
    ),
    value:
      typeof fact.value === "string"
        ? sanitizeString(
            fact.value,
            state,
          )
        : fact.value,
  }));

  const sources = result.sources.map((source) => ({
    type: sanitizeString(
      source.type,
      state,
    ),
    label: sanitizeString(
      source.label,
      state,
    ),
    reference: sanitizeString(
      source.reference,
      state,
    ),
  }));

  const sanitizeAction = (
    action: AiToolResult["suggestedActions"][number],
  ) => ({
    label: sanitizeString(
      action.label,
      state,
    ),
    href:
      typeof action.href === "string"
        ? sanitizeString(
            action.href,
            state,
          )
        : undefined,
  });

  const diagnosis = result.diagnosis
    ? {
        ...result.diagnosis,
        subjectId: sanitizeString(
          result.diagnosis.subjectId,
          state,
        ),
        state: sanitizeString(
          result.diagnosis.state,
          state,
        ),
        exactCause:
          result.diagnosis.exactCause
            ? {
                ...result.diagnosis.exactCause,
                code: sanitizeString(
                  result.diagnosis.exactCause.code,
                  state,
                ),
                label: sanitizeString(
                  result.diagnosis.exactCause.label,
                  state,
                ),
                evidenceRefs:
                  result.diagnosis.exactCause.evidenceRefs.map(
                    (reference) =>
                      sanitizeString(
                        reference,
                        state,
                      ),
                  ),
              }
            : undefined,
        possibleCauses:
          result.diagnosis.possibleCauses.map(
            (cause) => ({
              ...cause,
              code: sanitizeString(
                cause.code,
                state,
              ),
              label: sanitizeString(
                cause.label,
                state,
              ),
              evidenceRefs:
                cause.evidenceRefs.map(
                  (reference) =>
                    sanitizeString(
                      reference,
                      state,
                    ),
                ),
            }),
          ),
        nextSteps:
          result.diagnosis.nextSteps.map(
            sanitizeAction,
          ),
      }
    : result.diagnosis;

  const data = result.data
    ? (
        sanitizeUnknownValue(
          result.data,
          state,
        ) as Record<string, unknown>
      )
    : undefined;

  return {
    detections: state.detections,
    result: {
      ...result,
      title: sanitizeString(
        result.title,
        state,
      ),
      summary: sanitizeString(
        result.summary,
        state,
      ),
      facts,
      sources,
      suggestedActions:
        result.suggestedActions.map(
          sanitizeAction,
        ),
      diagnosis,
      data,
    },
  };
}

export function createAiChatService(dependencies: {
  config: CofferAiConfig;
  toolRegistry: AiToolRegistry;
  auditSink: AiAuditSink;
  responseComposer: AiResponseComposer;
  conversationContextService: AiConversationContextService;
  knowledgeService: AiKnowledgeService;
  conversationStore?: AiConversationStore;
}): AiChatService {
  const {
    config,
    toolRegistry,
    auditSink,
    responseComposer,
    conversationContextService,
    knowledgeService,
    conversationStore = transientAiConversationStore,
  } = dependencies;

  async function audit(
    actor: AiActorContext,
    event: Omit<AiAuditEvent, "requestId" | "actorType" | "actorRef" | "createdAt">,
  ): Promise<void> {
    await auditSink.write({
      ...event,
      requestId: actor.requestId,
      actorType: actor.actorType,
      actorRef: actorReference(actor),
      createdAt: new Date().toISOString(),
    });
  }

  return {
    async chat(input) {
      validateServiceInput(config, input.body);

      const sanitizedInput =
        sanitizeAiText(
          input.body.message,
        );

      const safeUserMessage =
        sanitizedInput.content;

      const actor = resolveAiActorContext(input.source, input.requestId);
      let currentIntent: AiIntent = "unknown";

      await audit(actor, {
        eventType: "request_received",
      });

      async function persistExchange(
        assistantMessage: Omit<AiChatResponseData, "conversationId">,
      ): Promise<string> {
        if (!actor.userId) {
          throw new CofferAiError({
            code: "AI_AUTH_REQUIRED",
            message: "Please sign in to use Coffer AI.",
            statusCode: 401,
          });
        }

        return conversationStore.saveExchange({
          ownerId: actor.userId,
          actorType: actor.actorType,
          requestedConversationId: input.body.conversationId,
          userMessage: safeUserMessage,
          assistantMessage,
          intent: currentIntent,
          requestId: actor.requestId,
        });
      }

      try {
        const conversationContext =
          actor.userId
              ? await conversationContextService.load({
                ownerId: actor.userId,
                actorType: actor.actorType,
                conversationId: input.body.conversationId,
                limit: config.conversationContextMessages,
              })
            : {
                messages: [],
                lastResourceId: null,
                lastIntent: null,
              };

        const sanitizedConversation =
          sanitizeConversationContext(
            conversationContext,
          );

        const rawClassification = classifyAiIntent({
          message: input.body.message,
          actorType: actor.actorType,
          pageContext: input.body.pageContext,
        });

        const classification = contextualizeClassification({
          classification: rawClassification,
          context: conversationContext,
          message: safeUserMessage,
        });

        currentIntent = classification.intent;

        const policy = evaluateAiPolicy({
          config,
          actor,
          classification,
        });

        if (!policy.allow) {
          await audit(actor, {
            eventType: "policy_denied",
            intent: currentIntent,
            reasonCode: policy.reasonCode,
          });

          if (
            policy.reasonCode === "CLARIFICATION_REQUIRED" ||
            policy.reasonCode === "INTENT_NOT_SUPPORTED"
          ) {
            const assistantMessage: Omit<AiChatResponseData, "conversationId"> = {
              messageId: randomUUID(),
              content: policy.safeMessage,
              verification: "unknown",
              confidence: "low",
              sources: [],
              diagnosis: null,
              suggestedActions: [],
              toolIds: [],
              facts: [],
            };

            const conversationId = await persistExchange(assistantMessage);

            return {
              success: true,
              data: {
                ...assistantMessage,
                conversationId,
              },
              meta: {
                requestId: actor.requestId,
                intent: currentIntent,
                role: actor.actorType,
                readOnly: true,
                degraded: false,
                modelUsed: false,
                model: null,
                modelTier: "none",
                modelProvider: "deterministic",
                grounded: true,
                knowledgeCount: 0,
              },
            };
          }

          throw new CofferAiError({
            code: `AI_${policy.reasonCode}`,
            message: policy.safeMessage,
            statusCode: statusForPolicyReason(policy.reasonCode),
          });
        }

        const toolId = toolForIntent(classification.intent);

        if (!toolId) {
          throw new CofferAiError({
            code: "AI_CAPABILITY_NOT_READY",
            message: "This capability is not available yet.",
            statusCode: 422,
          });
        }

        const rawResult: AiToolResult = await toolRegistry.execute({
          toolId,
          actor,
          policy,
          payload: {
            resourceId: classification.resourceId,
            paymentId: classification.resourceId,
            message: safeUserMessage,
            route: input.body.pageContext?.route,
          },
        });

        /*
         * Defense in depth:
         * - Tool/service output is untrusted data, not executable instructions.
         * - Scrub secret-like strings and sensitive structured fields BEFORE
         *   any optional model/composer sees the evidence.
         * - The same sanitized result is also what the API returns.
         */
        const sanitizedToolResult =
          sanitizeToolResult(rawResult);

        const result =
          sanitizedToolResult.result;

        await audit(actor, {
          eventType: "tool_called",
          intent: currentIntent,
          toolId,
        });

        const responseScope =
          detectAiResponseScope(safeUserMessage);

        let knowledge: ReadonlyArray<AiKnowledgeSnippet> = [];

        if (
          config.knowledgeEnabled &&
          shouldSearchKnowledge(
            currentIntent,
            actor.actorType,
          ) &&
          shouldUseKnowledgeForScope(responseScope)
        ) {
          try {
            knowledge = await knowledgeService.search({
              message: `${safeUserMessage}\n${result.summary}`,
              limit: config.knowledgeLimit,
              actorType: actor.actorType,
              intent: currentIntent,
            });

            if (knowledge.length > 0) {
              await audit(actor, {
                eventType: "knowledge_retrieved",
                intent: currentIntent,
                toolId,
                metadata: {
                  count: knowledge.length,
                },
              });
            }
          } catch {
            knowledge = [];
          }
        }

        const responseStyle = actor.userId
          ? await responseStyleForActor({
              ownerId: actor.userId,
              actorType: actor.actorType,
              message: safeUserMessage,
            })
          : "balanced" as const;

        const composed = await responseComposer.compose({
          actor,
          message: safeUserMessage,
          classification,
          result,
          context:
            sanitizedConversation.context,
          knowledge,
          responseStyle,
        });

        if (composed.model) {
          await audit(actor, {
            eventType: composed.degraded
              ? "model_fallback"
              : "model_called",
            intent: currentIntent,
            toolId,
            reasonCode: composed.verifierReason,
            metadata: {
              model: composed.model,
              tier: composed.modelTier,
              provider: composed.provider,
              degraded: composed.degraded,
            },
          });
        }

        const sanitized = sanitizeAiText(composed.content);

        const modelAccepted = Boolean(
          composed.model &&
          !composed.degraded,
        );

        /*
         * Published knowledge is part of both:
         * - accepted grounded-model responses, and
         * - the zero-cost deterministic fallback.
         *
         * Therefore its sources must remain visible even when
         * AI_MODEL_ENABLED=false. Live tool evidence still stays
         * authoritative and is listed first.
         */
        const sources = uniqueSources([
          ...result.sources,
          ...(shouldUseKnowledgeForScope(responseScope)
            ? knowledge.map((item) => item.source)
            : []),
        ]);

        const responseActions =
          suggestedActionsForScope(
            responseScope,
            result.suggestedActions,
          );

        const responseFacts =
          factsForScope(
            responseScope,
            result.facts,
          );

        await audit(actor, {
          eventType: "response_completed",
          intent: currentIntent,
          toolId,
          reasonCode: result.verification,
          metadata: {
            sanitizerDetections:
              sanitizedInput.detections.length +
              sanitizedConversation.detections +
              sanitizedToolResult.detections +
              sanitized.detections.length,
            readOnly: true,
            modelUsed: modelAccepted,
            modelProvider: composed.provider,
            knowledgeCount: knowledge.length,
            responseStyle,
            responseScope,
          },
        });

        const assistantMessage: Omit<AiChatResponseData, "conversationId"> = {
          messageId: randomUUID(),
          content: sanitized.content,
          verification: result.verification,
          confidence: result.confidence,
          sources,
          diagnosis: result.diagnosis ?? null,
          suggestedActions: responseActions,
          toolIds: [toolId],
          facts: responseFacts,
          data: result.data,
        };

        const conversationId = await persistExchange(assistantMessage);

        return {
          success: true,
          data: {
            ...assistantMessage,
            conversationId,
          },
          meta: {
            requestId: actor.requestId,
            intent: currentIntent,
            role: actor.actorType,
            readOnly: true,
            degraded:
              composed.degraded ||
              sanitizedInput.detections.length > 0 ||
              sanitizedConversation.detections > 0 ||
              sanitizedToolResult.detections > 0 ||
              sanitized.detections.length > 0,
            modelUsed: modelAccepted,
            model: composed.model,
            modelTier: composed.modelTier,
            modelProvider: composed.provider,
            grounded: true,
            knowledgeCount: knowledge.length,
            responseStyle,
          },
        };
      } catch (error) {
        await audit(actor, {
          eventType: "request_failed",
          intent: currentIntent,
          reasonCode:
            error instanceof CofferAiError
              ? error.code
              : "AI_INTERNAL_ERROR",
        });

        throw error;
      }
    },
  };
}
