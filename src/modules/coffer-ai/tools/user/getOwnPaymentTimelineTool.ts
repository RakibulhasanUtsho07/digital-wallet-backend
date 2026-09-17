import { CofferAiError } from "../../errors/cofferAiError.js";
import type {
  AiOwnedPaymentEvidence,
  OwnedPaymentReader,
} from "../../types/cofferAi.types.js";
import type { AiToolDefinition } from "../aiToolRegistry.js";

const SAFE_CODE_PATTERN = /^[a-zA-Z0-9_.:-]{1,100}$/;

function safeTextCode(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return SAFE_CODE_PATTERN.test(normalized) ? normalized : null;
}

function safeIsoDate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeEvidence(
  evidence: AiOwnedPaymentEvidence,
  expectedPaymentId: string,
): AiOwnedPaymentEvidence {
  if (evidence.paymentId !== expectedPaymentId) {
    throw new CofferAiError({
      code: "AI_DEPENDENCY_RESPONSE_INVALID",
      message: "The payment evidence could not be verified.",
      statusCode: 502,
    });
  }

  const state = safeTextCode(evidence.state);

  if (!state) {
    throw new CofferAiError({
      code: "AI_DEPENDENCY_RESPONSE_INVALID",
      message: "The payment state could not be verified.",
      statusCode: 502,
    });
  }

  const currency =
    typeof evidence.currency === "string" &&
    /^[A-Za-z]{3}$/.test(evidence.currency)
      ? evidence.currency.toUpperCase()
      : null;

  const subjectType =
    evidence.subjectType ===
      "gateway_payment" ||
    evidence.subjectType ===
      "wallet_transaction"
      ? evidence.subjectType
      : null;

  if (!subjectType) {
    throw new CofferAiError({
      code: "AI_DEPENDENCY_RESPONSE_INVALID",
      message: "The payment resource type could not be verified.",
      statusCode: 502,
    });
  }

  return {
    subjectType,
    paymentId: expectedPaymentId,
    state,
    amountMinor:
      typeof evidence.amountMinor === "number" &&
      Number.isSafeInteger(evidence.amountMinor) &&
      evidence.amountMinor >= 0
        ? evidence.amountMinor
        : null,
    currency,
    createdAt: safeIsoDate(evidence.createdAt),
    updatedAt: safeIsoDate(evidence.updatedAt),
    failureCode: safeTextCode(evidence.failureCode),
    failureCategory: safeTextCode(evidence.failureCategory),
    providerStatusCode: safeTextCode(evidence.providerStatusCode),
    events: evidence.events.slice(0, 50).flatMap((event) => {
      const code = safeTextCode(event.code);
      const status = safeTextCode(event.status);
      const at = safeIsoDate(event.at);

      return code && status && at ? [{ code, status, at }] : [];
    }),
  };
}

export function createGetOwnPaymentTimelineTool(
  reader: OwnedPaymentReader,
): AiToolDefinition {
  return {
    id: "user.payment.timeline",
    async execute({ actor, payload }) {
      if (actor.actorType !== "user" || !actor.userId) {
        throw new CofferAiError({
          code: "AI_USER_CONTEXT_REQUIRED",
          message: "A personal account context is required.",
          statusCode: 403,
        });
      }

      const paymentId =
        typeof payload.paymentId === "string"
          ? payload.paymentId.trim()
          : "";

      if (
        paymentId.length < 6 ||
        paymentId.length > 128 ||
        !/^[a-zA-Z0-9_-]+$/.test(paymentId)
      ) {
        throw new CofferAiError({
          code: "AI_PAYMENT_ID_INVALID",
          message: "A valid payment reference is required.",
          statusCode: 400,
        });
      }

      // userId always comes from the trusted actor. The payload cannot
      // override it, even if a client sends userId/ownerId fields.
      const evidence = await reader.findOwnedPaymentTimeline({
        paymentId,
        userId: actor.userId,
      });

      if (!evidence) {
        throw new CofferAiError({
          code: "AI_PAYMENT_NOT_FOUND",
          message: "The payment was not found in this account.",
          statusCode: 404,
        });
      }

      return normalizeEvidence(evidence, paymentId);
    },
  };
}
