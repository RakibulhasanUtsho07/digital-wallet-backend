import {
  createHash,
  randomUUID,
} from "node:crypto";

import type { CofferAiConfig } from "../config/cofferAiConfig.js";
import { resolveAiActorContext } from "../context/aiActorContextService.js";
import { diagnosePayment } from "../diagnostics/paymentDiagnosticService.js";
import { CofferAiError } from "../errors/cofferAiError.js";
import { classifyAiIntent } from "../intents/aiIntentClassifier.js";
import { evaluateAiPolicy } from "../policies/aiPolicyEngine.js";

import { sanitizeAiText } from "../privacy/aiPrivacySanitizer.js";
import type { AiToolRegistry } from "../tools/aiToolRegistry.js";
import type {
  AiActorContext,
  AiAuditEvent,
  AiAuditSink,
  AiChatRequestInput,
  AiChatResponseData,
  AiChatResult,
  AiExplanationProvider,
  AiIntent,
  AiOwnedPaymentEvidence,
  AiTrustedRequestSource,
} from "../types/cofferAi.types.js";
import { verifyPaymentExplanation } from "../verification/aiClaimVerifier.js";
import { AiConversationStore, transientAiConversationStore } from "../controllers/aiConversationStore.js";

export interface AiChatService {
  chat(input: {
    requestId: string;
    source: AiTrustedRequestSource;
    body: AiChatRequestInput;
  }): Promise<AiChatResult>;
}

function actorReference(actor: AiActorContext): string | null {
  const identifier = actor.merchantId ?? actor.userId;

  if (!identifier) {
    return null;
  }

  return createHash("sha256").update(identifier).digest("hex").slice(0, 20);
}

function statusForPolicyReason(reasonCode: string): number {
  if (reasonCode === "AUTH_REQUIRED") {
    return 401;
  }

  if (reasonCode === "FEATURE_DISABLED") {
    return 503;
  }

  if (
    reasonCode === "INTENT_NOT_SUPPORTED" ||
    reasonCode === "CLARIFICATION_REQUIRED"
  ) {
    return 422;
  }

  return 403;
}

function verificationFor(diagnosis: ReturnType<typeof diagnosePayment>): {
  verification: "verified" | "partial" | "unknown";
  confidence: "high" | "medium" | "low";
} {
  if (diagnosis.verified && diagnosis.exactCause) {
    return {
      verification: "verified",
      confidence: "high",
    };
  }

  if (diagnosis.possibleCauses.length > 0) {
    return {
      verification: "partial",
      confidence: diagnosis.possibleCauses[0].confidence,
    };
  }

  return {
    verification: "unknown",
    confidence: "low",
  };
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
}

export function createAiChatService(dependencies: {
  config: CofferAiConfig;
  toolRegistry: AiToolRegistry;
  explanationProvider: AiExplanationProvider;
  auditSink: AiAuditSink;
  conversationStore?: AiConversationStore;
}): AiChatService {
  const {
    config,
    toolRegistry,
    explanationProvider,
    auditSink,
    conversationStore =
      transientAiConversationStore,
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

      const actor = resolveAiActorContext(
        input.source,
        input.requestId,
      );
      let currentIntent: AiIntent = "unknown";

      await audit(actor, {
        eventType: "request_received",
      });

      async function persistExchange(
        assistantMessage: Omit<
          AiChatResponseData,
          "conversationId"
        >,
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
          requestedConversationId:
            input.body.conversationId,
          userMessage:
            input.body.message,
          assistantMessage,
          intent:
            currentIntent,
          requestId:
            actor.requestId,
        });
      }

      try {
        const classification = classifyAiIntent({
          message: input.body.message,
          actorType: actor.actorType,
          pageContext: input.body.pageContext,
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

          if (policy.reasonCode === "CLARIFICATION_REQUIRED") {
            const assistantMessage = {
              messageId:
                randomUUID(),
              content:
                policy.safeMessage,
              verification:
                "unknown" as const,
              confidence:
                "low" as const,
              sources:
                [],
              diagnosis:
                null,
              suggestedActions:
                [],
            };
            const conversationId =
              await persistExchange(
                assistantMessage,
              );

            return {
              success: true,
              data: {
                ...assistantMessage,
                conversationId,
              },
              meta: {
                requestId: actor.requestId,
                intent: currentIntent,
                degraded: false,
              },
            };
          }

          throw new CofferAiError({
            code: `AI_${policy.reasonCode}`,
            message: policy.safeMessage,
            statusCode: statusForPolicyReason(policy.reasonCode),
          });
        }

        if (
          classification.intent !== "payment_diagnosis" ||
          !classification.resourceId
        ) {
          throw new CofferAiError({
            code: "AI_CAPABILITY_NOT_READY",
            message:
              "This read-only capability is not available in the current release.",
            statusCode: 422,
          });
        }

        const evidence = await toolRegistry.execute<AiOwnedPaymentEvidence>({
          toolId: "user.payment.timeline",
          actor,
          policy,
          payload: {
            paymentId: classification.resourceId,
          },
        });

        await audit(actor, {
          eventType: "tool_called",
          intent: currentIntent,
          toolId: "user.payment.timeline",
        });

        const diagnosis = diagnosePayment(evidence);
        let draft = "";
        let providerDegraded = false;

        try {
          draft = await explanationProvider.explainPayment({
            diagnosis,
            evidence,
          });
        } catch {
          // The verifier below produces a deterministic safe fallback. No raw
          // provider error or stack trace is exposed to the user or model.
          providerDegraded = true;
        }

        const verifiedExplanation = verifyPaymentExplanation({
          draft,
          diagnosis,
        });
        const sanitized = sanitizeAiText(verifiedExplanation.content);
        const trust = verificationFor(diagnosis);

        await audit(actor, {
          eventType: "diagnosis_completed",
          intent: currentIntent,
          reasonCode: trust.verification,
          metadata: {
            verified: diagnosis.verified,
            providerDegraded,
            sanitizerDetections: sanitized.detections.length,
          },
        });

        const assistantMessage = {
          messageId:
            randomUUID(),
          content:
            sanitized.content,
          verification:
            trust.verification,
          confidence:
            trust.confidence,
          sources: [
            {
              type:
                diagnosis.subjectType ===
                "wallet_transaction"
                  ? "wallet_transaction_timeline" as const
                  : "payment_timeline" as const,
              label:
                diagnosis.subjectType ===
                "wallet_transaction"
                  ? "Owned wallet transaction timeline"
                  : "Owned gateway payment timeline",
              reference:
                evidence.paymentId,
            },
            {
              type:
                "system_policy" as const,
              label:
                "Coffer payment diagnostic rules",
              reference:
                "payment-diagnostic-v2",
            },
          ],
          diagnosis,
          suggestedActions:
            diagnosis.nextSteps,
        };
        const conversationId =
          await persistExchange(
            assistantMessage,
          );

        return {
          success: true,
          data: {
            ...assistantMessage,
            conversationId,
          },
          meta: {
            requestId: actor.requestId,
            intent: currentIntent,
            degraded:
              providerDegraded ||
              verifiedExplanation.usedFallback ||
              sanitized.detections.length > 0,
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
