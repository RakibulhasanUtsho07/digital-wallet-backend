import type { CofferAiConfig } from "../config/cofferAiConfig.js";
import type {
  AiActorContext,
  AiCapability,
  AiIntentClassification,
  AiPolicyDecision,
  AiPolicyReasonCode,
  AiResourceOwnerScope,
  AiToolId,
} from "../types/cofferAi.types.js";

function deny(
  reasonCode: AiPolicyReasonCode,
  safeMessage: string,
): AiPolicyDecision {
  return {
    allow: false,
    reasonCode,
    allowedToolIds: [],
    allowedDataClasses: [],
    safeMessage,
  };
}

function allow(input: {
  tools: ReadonlyArray<AiToolId>;
  dataClasses: AiPolicyDecision["allowedDataClasses"];
}): AiPolicyDecision {
  return {
    allow: true,
    reasonCode: "ALLOW",
    allowedToolIds: input.tools,
    allowedDataClasses: input.dataClasses,
    safeMessage: "Request is allowed within the authenticated account scope.",
  };
}

function hasCapability(
  actor: AiActorContext,
  capability: AiCapability,
): boolean {
  return actor.capabilities.includes(capability);
}

function accountIsRestricted(actor: AiActorContext): boolean {
  return (
    actor.accountState === "suspended" ||
    actor.accountState === "disabled" ||
    actor.accountState === "locked"
  );
}

export function evaluateAiPolicy(input: {
  config: CofferAiConfig;
  actor: AiActorContext;
  classification: AiIntentClassification;
}): AiPolicyDecision {
  const { config, actor, classification } = input;

  if (!config.enabled) {
    return deny(
      "FEATURE_DISABLED",
      "Coffer AI Copilot is currently unavailable.",
    );
  }

  if (classification.intent === "secret_request") {
    return deny(
      "SECRET_ACCESS_FORBIDDEN",
      "Coffer AI cannot reveal passwords, OTPs, tokens, API secrets, or signing secrets.",
    );
  }

  if (!actor.isAuthenticated || actor.actorType === "guest") {
    return deny(
      "AUTH_REQUIRED",
      "Please sign in to access account-specific assistance.",
    );
  }

  if (actor.actorType === "admin") {
    return deny(
      "ACTOR_NOT_SUPPORTED",
      "The admin assistant is not included in this release.",
    );
  }

  if (accountIsRestricted(actor)) {
    return deny(
      "ACCOUNT_RESTRICTED",
      "AI assistance is unavailable for this account state. Please contact support.",
    );
  }

  if (
    config.requireKnownAccountState &&
    actor.accountState === "unknown"
  ) {
    return deny(
      "ACCOUNT_RESTRICTED",
      "The account state could not be verified.",
    );
  }

  if (classification.needsClarification) {
    return deny(
      "CLARIFICATION_REQUIRED",
      classification.intent === "payment_diagnosis" ||
        classification.intent === "merchant_payment_diagnosis"
        ? "Please provide the payment or transaction reference you want me to check."
        : "Please clarify what you want to check.",
    );
  }

  if (classification.intent === "payment_diagnosis") {
    if (!config.userAssistantEnabled) {
      return deny(
        "FEATURE_DISABLED",
        "The personal assistant is currently unavailable.",
      );
    }

    if (
      actor.actorType !== "user" ||
      !hasCapability(actor, "payment:read:self")
    ) {
      return deny(
        "CAPABILITY_MISSING",
        "This payment tool is available only for a personal account.",
      );
    }

    return allow({
      tools: ["user.payment.timeline"],
      dataClasses: ["account_private"],
    });
  }

  if (classification.intent === "merchant_payment_diagnosis") {
    if (!config.merchantAssistantEnabled) {
      return deny(
        "FEATURE_DISABLED",
        "The merchant assistant is currently unavailable.",
      );
    }

    if (actor.actorType !== "merchant" || !actor.merchantId) {
      return deny(
        "MERCHANT_CONTEXT_REQUIRED",
        "A verified merchant context is required for this request.",
      );
    }

    if (
      config.requireVerifiedMerchant &&
      actor.merchantVerificationState !== "verified"
    ) {
      return deny(
        "MERCHANT_NOT_VERIFIED",
        "Merchant verification must be complete before using this tool.",
      );
    }

    if (!hasCapability(actor, "merchant:payment:read:self")) {
      return deny(
        "CAPABILITY_MISSING",
        "The merchant payment capability is unavailable.",
      );
    }

    return allow({
      tools: ["merchant.payment.timeline"],
      dataClasses: ["merchant_private"],
    });
  }

  return deny(
    "INTENT_NOT_SUPPORTED",
    "This request is not supported by the current read-only assistant.",
  );
}

export function evaluateResourceOwnership(input: {
  actor: AiActorContext;
  owner: AiResourceOwnerScope;
}): AiPolicyDecision {
  const { actor, owner } = input;

  if (
    owner.userId &&
    (!actor.userId || owner.userId !== actor.userId)
  ) {
    return deny(
      "RESOURCE_SCOPE_MISMATCH",
      "The requested resource is not available in this account scope.",
    );
  }

  if (
    owner.merchantId &&
    (!actor.merchantId || owner.merchantId !== actor.merchantId)
  ) {
    return deny(
      "RESOURCE_SCOPE_MISMATCH",
      "The requested resource is not available in this merchant scope.",
    );
  }

  return allow({
    tools: [],
    dataClasses:
      actor.actorType === "merchant"
        ? ["merchant_private"]
        : ["account_private"],
  });
}
