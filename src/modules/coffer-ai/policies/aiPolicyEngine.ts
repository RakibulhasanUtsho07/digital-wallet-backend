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
    safeMessage: "Request is allowed within the authenticated role scope.",
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
    return deny("FEATURE_DISABLED", "Coffer AI is currently unavailable.");
  }

  if (classification.intent === "secret_request") {
    return deny(
      "SECRET_ACCESS_FORBIDDEN",
      "Coffer AI cannot reveal passwords, OTPs, tokens, API secrets, private keys, or signing secrets.",
    );
  }

  if (!actor.isAuthenticated || actor.actorType === "guest") {
    return deny(
      "AUTH_REQUIRED",
      "Please sign in to access account-specific assistance.",
    );
  }

  if (accountIsRestricted(actor)) {
    return deny(
      "ACCOUNT_RESTRICTED",
      "AI assistance is unavailable for this account state.",
    );
  }

  if (config.requireKnownAccountState && actor.accountState === "unknown") {
    return deny(
      "ACCOUNT_RESTRICTED",
      "The account state could not be verified.",
    );
  }

  if (classification.needsClarification) {
    return deny(
      "CLARIFICATION_REQUIRED",
      classification.intent === "payment_diagnosis" ||
        classification.intent === "merchant_payment_diagnosis" ||
        classification.intent === "transaction_lookup" ||
        classification.intent === "transfer_diagnosis" ||
        classification.intent === "merchant_refund_diagnosis" ||
        classification.intent === "merchant_payout_diagnosis" ||
        classification.intent === "merchant_settlement_diagnosis" ||
        classification.intent === "merchant_webhook_diagnosis" ||
        classification.intent === "merchant_api_key_diagnosis"
        ? classification.intent.startsWith("merchant_")
          ? "Please provide the exact merchant refund, payout, settlement, webhook event, or API key ID you want me to diagnose."
          : "Please provide the payment or transaction reference you want me to check."
        : classification.intent === "receipt_lookup"
          ? "Please provide the receipt ID you want me to check."
          : "Please clarify what you want me to check.",
    );
  }

  switch (classification.intent) {
    case "payment_diagnosis":
      if (!config.userAssistantEnabled) {
        return deny("FEATURE_DISABLED", "The personal assistant is unavailable.");
      }
      if (actor.actorType !== "user" || !hasCapability(actor, "payment:read:self")) {
        return deny("CAPABILITY_MISSING", "This tool is available only for a personal account.");
      }
      return allow({
        tools: ["user.payment.timeline"],
        dataClasses: ["account_private"],
      });

    case "wallet_summary":
      if (!config.userAssistantEnabled) {
        return deny("FEATURE_DISABLED", "The personal assistant is unavailable.");
      }
      if (actor.actorType !== "user" || !hasCapability(actor, "wallet:read:self")) {
        return deny("CAPABILITY_MISSING", "Wallet information is available only for the signed-in personal account.");
      }
      return allow({
        tools: ["user.wallet.summary"],
        dataClasses: ["account_private"],
      });

    case "kyc_status":
      if (!config.userAssistantEnabled) {
        return deny("FEATURE_DISABLED", "The personal assistant is unavailable.");
      }
      if (actor.actorType !== "user" || !hasCapability(actor, "kyc:read:self")) {
        return deny("CAPABILITY_MISSING", "KYC information is available only for the signed-in personal account.");
      }
      return allow({
        tools: ["user.kyc.status"],
        dataClasses: ["account_private"],
      });

    case "transaction_lookup":
    case "transfer_diagnosis":
      if (!config.userAssistantEnabled) {
        return deny("FEATURE_DISABLED", "The personal assistant is unavailable.");
      }
      if (
        actor.actorType !== "user" ||
        !hasCapability(actor, "transaction:read:self")
      ) {
        return deny(
          "CAPABILITY_MISSING",
          "Transaction information is available only for the signed-in personal account.",
        );
      }
      return allow({
        tools: ["user.transaction.detail"],
        dataClasses: ["account_private"],
      });

    case "receipt_lookup":
      if (!config.userAssistantEnabled) {
        return deny("FEATURE_DISABLED", "The personal assistant is unavailable.");
      }
      if (actor.actorType !== "user" || !hasCapability(actor, "receipt:read:self")) {
        return deny(
          "CAPABILITY_MISSING",
          "Receipt information is available only for the signed-in personal account.",
        );
      }
      return allow({
        tools: ["user.receipt.detail"],
        dataClasses: ["account_private"],
      });

    case "security_summary":
      if (!config.userAssistantEnabled) {
        return deny("FEATURE_DISABLED", "The personal assistant is unavailable.");
      }
      if (actor.actorType !== "user" || !hasCapability(actor, "security:read:self")) {
        return deny(
          "CAPABILITY_MISSING",
          "Security information is available only for the signed-in personal account.",
        );
      }
      return allow({
        tools: ["user.security.summary"],
        dataClasses: ["account_private"],
      });

    case "merchant_payment_diagnosis":
      if (!config.merchantAssistantEnabled) {
        return deny("FEATURE_DISABLED", "The merchant assistant is unavailable.");
      }
      if (actor.actorType !== "merchant" || !actor.merchantId) {
        return deny("MERCHANT_CONTEXT_REQUIRED", "A merchant context is required.");
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
        return deny("CAPABILITY_MISSING", "The merchant payment capability is unavailable.");
      }
      return allow({
        tools: ["merchant.payment.timeline"],
        dataClasses: ["merchant_private"],
      });

    case "merchant_overview":
      if (!config.merchantAssistantEnabled) {
        return deny("FEATURE_DISABLED", "The merchant assistant is unavailable.");
      }
      if (actor.actorType !== "merchant" || !actor.merchantId) {
        return deny("MERCHANT_CONTEXT_REQUIRED", "A merchant context is required.");
      }
      if (!hasCapability(actor, "merchant:profile:read:self")) {
        return deny("CAPABILITY_MISSING", "The merchant overview capability is unavailable.");
      }
      return allow({
        tools: ["merchant.overview"],
        dataClasses: ["merchant_private", "aggregate_private"],
      });

    case "merchant_refund_summary":
      if (!config.merchantAssistantEnabled) {
        return deny("FEATURE_DISABLED", "The merchant assistant is unavailable.");
      }
      if (actor.actorType !== "merchant" || !actor.merchantId) {
        return deny("MERCHANT_CONTEXT_REQUIRED", "A merchant context is required.");
      }
      if (!hasCapability(actor, "merchant:refund:read:self")) {
        return deny("CAPABILITY_MISSING", "The merchant refund capability is unavailable.");
      }
      return allow({
        tools: ["merchant.refunds.summary"],
        dataClasses: ["merchant_private", "aggregate_private"],
      });

    case "merchant_payout_summary":
      if (!config.merchantAssistantEnabled) {
        return deny("FEATURE_DISABLED", "The merchant assistant is unavailable.");
      }
      if (actor.actorType !== "merchant" || !actor.merchantId) {
        return deny("MERCHANT_CONTEXT_REQUIRED", "A merchant context is required.");
      }
      if (!hasCapability(actor, "merchant:payout:read:self")) {
        return deny("CAPABILITY_MISSING", "The merchant payout capability is unavailable.");
      }
      return allow({
        tools: ["merchant.payouts.summary"],
        dataClasses: ["merchant_private", "aggregate_private"],
      });

    case "merchant_settlement_summary":
      if (!config.merchantAssistantEnabled) {
        return deny("FEATURE_DISABLED", "The merchant assistant is unavailable.");
      }
      if (actor.actorType !== "merchant" || !actor.merchantId) {
        return deny("MERCHANT_CONTEXT_REQUIRED", "A merchant context is required.");
      }
      if (!hasCapability(actor, "merchant:settlement:read:self")) {
        return deny("CAPABILITY_MISSING", "The merchant settlement capability is unavailable.");
      }
      return allow({
        tools: ["merchant.settlements.summary"],
        dataClasses: ["merchant_private", "aggregate_private"],
      });

    case "merchant_webhook_summary":
      if (!config.merchantAssistantEnabled) {
        return deny("FEATURE_DISABLED", "The merchant assistant is unavailable.");
      }
      if (actor.actorType !== "merchant" || !actor.merchantId) {
        return deny("MERCHANT_CONTEXT_REQUIRED", "A merchant context is required.");
      }
      if (!hasCapability(actor, "merchant:webhook:read:self")) {
        return deny("CAPABILITY_MISSING", "The merchant webhook capability is unavailable.");
      }
      return allow({
        tools: ["merchant.webhooks.summary"],
        dataClasses: ["merchant_private", "aggregate_private", "restricted"],
      });

    case "merchant_api_key_summary":
      if (!config.merchantAssistantEnabled) {
        return deny("FEATURE_DISABLED", "The merchant assistant is unavailable.");
      }
      if (actor.actorType !== "merchant" || !actor.merchantId) {
        return deny("MERCHANT_CONTEXT_REQUIRED", "A merchant context is required.");
      }
      if (!hasCapability(actor, "merchant:api_key:read:self")) {
        return deny("CAPABILITY_MISSING", "The merchant API-key metadata capability is unavailable.");
      }
      return allow({
        tools: ["merchant.api_keys.summary"],
        dataClasses: ["merchant_private", "restricted"],
      });


    case "merchant_refund_diagnosis":
      if (!config.merchantAssistantEnabled) {
        return deny("FEATURE_DISABLED", "The merchant assistant is unavailable.");
      }
      if (actor.actorType !== "merchant" || !actor.merchantId || !actor.userId) {
        return deny("MERCHANT_CONTEXT_REQUIRED", "A merchant context is required.");
      }
      if (!hasCapability(actor, "merchant:refund:read:self")) {
        return deny("CAPABILITY_MISSING", "The merchant refund diagnostic capability is unavailable.");
      }
      return allow({
        tools: ["merchant.refund.diagnosis"],
        dataClasses: ["merchant_private"],
      });

    case "merchant_payout_diagnosis":
      if (!config.merchantAssistantEnabled) {
        return deny("FEATURE_DISABLED", "The merchant assistant is unavailable.");
      }
      if (actor.actorType !== "merchant" || !actor.merchantId || !actor.userId) {
        return deny("MERCHANT_CONTEXT_REQUIRED", "A merchant context is required.");
      }
      if (!hasCapability(actor, "merchant:payout:read:self")) {
        return deny("CAPABILITY_MISSING", "The merchant payout diagnostic capability is unavailable.");
      }
      return allow({
        tools: ["merchant.payout.diagnosis"],
        dataClasses: ["merchant_private"],
      });

    case "merchant_settlement_diagnosis":
      if (!config.merchantAssistantEnabled) {
        return deny("FEATURE_DISABLED", "The merchant assistant is unavailable.");
      }
      if (actor.actorType !== "merchant" || !actor.merchantId || !actor.userId) {
        return deny("MERCHANT_CONTEXT_REQUIRED", "A merchant context is required.");
      }
      if (!hasCapability(actor, "merchant:settlement:read:self")) {
        return deny("CAPABILITY_MISSING", "The merchant settlement diagnostic capability is unavailable.");
      }
      return allow({
        tools: ["merchant.settlement.diagnosis"],
        dataClasses: ["merchant_private"],
      });

    case "merchant_webhook_diagnosis":
      if (!config.merchantAssistantEnabled) {
        return deny("FEATURE_DISABLED", "The merchant assistant is unavailable.");
      }
      if (actor.actorType !== "merchant" || !actor.merchantId) {
        return deny("MERCHANT_CONTEXT_REQUIRED", "A merchant context is required.");
      }
      if (!hasCapability(actor, "merchant:webhook:read:self")) {
        return deny("CAPABILITY_MISSING", "The merchant webhook diagnostic capability is unavailable.");
      }
      return allow({
        tools: ["merchant.webhook.diagnosis"],
        dataClasses: ["merchant_private", "restricted"],
      });

    case "merchant_api_key_diagnosis":
      if (!config.merchantAssistantEnabled) {
        return deny("FEATURE_DISABLED", "The merchant assistant is unavailable.");
      }
      if (actor.actorType !== "merchant" || !actor.merchantId || !actor.userId) {
        return deny("MERCHANT_CONTEXT_REQUIRED", "A merchant context is required.");
      }
      if (!hasCapability(actor, "merchant:api_key:read:self")) {
        return deny("CAPABILITY_MISSING", "The merchant API-key diagnostic capability is unavailable.");
      }
      return allow({
        tools: ["merchant.api_key.diagnosis"],
        dataClasses: ["merchant_private", "restricted"],
      });

    case "merchant_analytics_summary":
      if (!config.merchantAssistantEnabled) {
        return deny("FEATURE_DISABLED", "The merchant assistant is unavailable.");
      }
      if (actor.actorType !== "merchant" || !actor.merchantId) {
        return deny("MERCHANT_CONTEXT_REQUIRED", "A merchant context is required.");
      }
      if (!hasCapability(actor, "merchant:analytics:read:self")) {
        return deny("CAPABILITY_MISSING", "The merchant analytics capability is unavailable.");
      }
      return allow({
        tools: ["merchant.analytics.summary"],
        dataClasses: ["merchant_private", "aggregate_private"],
      });

    case "support_investigation":
      if (!config.supportAssistantEnabled) {
        return deny("FEATURE_DISABLED", "The support assistant is unavailable.");
      }
      if (
        actor.actorType !== "support" ||
        !hasCapability(actor, "support:customer:search") ||
        !hasCapability(actor, "support:payment:read") ||
        !hasCapability(actor, "support:transaction:read")
      ) {
        return deny("CAPABILITY_MISSING", "This investigation tool is available only to Support Agents.");
      }
      return allow({
        tools: ["support.investigate"],
        dataClasses: ["support_private"],
      });

    case "support_operations_summary":
      if (!config.supportAssistantEnabled) {
        return deny("FEATURE_DISABLED", "The support assistant is unavailable.");
      }
      if (actor.actorType !== "support" || !hasCapability(actor, "support:operations:read")) {
        return deny("CAPABILITY_MISSING", "This tool is available only to Support Agents.");
      }
      return allow({
        tools: ["support.operations.summary"],
        dataClasses: ["support_private", "aggregate_private"],
      });

    case "analyst_wallet_snapshot":
      if (!config.analystAssistantEnabled) {
        return deny("FEATURE_DISABLED", "The analyst assistant is unavailable.");
      }
      if (actor.actorType !== "analyst" || !hasCapability(actor, "analyst:wallet:read")) {
        return deny("CAPABILITY_MISSING", "This tool is available only to Analysts.");
      }
      return allow({
        tools: ["analyst.wallet.snapshot"],
        dataClasses: ["aggregate_private"],
      });

    case "analyst_payment_snapshot":
    case "analyst_risk_snapshot":
    case "analyst_revenue_snapshot": {
      const capability = classification.intent === "analyst_payment_snapshot"
        ? "analyst:payment:read" as const
        : classification.intent === "analyst_risk_snapshot"
          ? "analyst:risk:read" as const
          : "analyst:revenue:read" as const;
      const tool = classification.intent === "analyst_payment_snapshot"
        ? "analyst.payment.snapshot" as const
        : classification.intent === "analyst_risk_snapshot"
          ? "analyst.risk.snapshot" as const
          : "analyst.revenue.snapshot" as const;
      if (!config.analystAssistantEnabled) {
        return deny("FEATURE_DISABLED", "The analyst assistant is unavailable.");
      }
      if (actor.actorType !== "analyst" || !hasCapability(actor, capability)) {
        return deny("CAPABILITY_MISSING", "This tool is available only to Analysts.");
      }
      return allow({ tools: [tool], dataClasses: ["aggregate_private"] });
    }

    case "admin_platform_overview":
      if (!config.adminAssistantEnabled) {
        return deny("FEATURE_DISABLED", "The admin assistant is unavailable.");
      }
      if (
        (actor.actorType !== "admin" && actor.actorType !== "super_admin") ||
        !hasCapability(actor, "admin:platform:read")
      ) {
        return deny("CAPABILITY_MISSING", "This tool is available only to administrators.");
      }
      return allow({
        tools: ["admin.platform.overview"],
        dataClasses: ["aggregate_private"],
      });

    case "admin_risk_snapshot":
    case "admin_finance_snapshot":
      if (!config.adminAssistantEnabled) {
        return deny("FEATURE_DISABLED", "The admin assistant is unavailable.");
      }
      if (
        (actor.actorType !== "admin" && actor.actorType !== "super_admin") ||
        !hasCapability(actor, "admin:platform:read")
      ) {
        return deny("CAPABILITY_MISSING", "This tool is available only to administrators.");
      }
      return allow({
        tools: [classification.intent === "admin_risk_snapshot"
          ? "admin.risk.snapshot" : "admin.finance.snapshot"],
        dataClasses: ["aggregate_private"],
      });

    default: {
      const examples: Record<AiActorContext["actorType"], string> = {
        user: "your wallet, KYC, a payment or transaction reference, a receipt, or account security",
        merchant: "your business overview, payment, refund, payout, settlement, webhook, API key, or analytics",
        support: "a customer or payment reference, or the Support queue summary",
        analyst: "aggregate payments, wallets, risk, or revenue",
        admin: "the platform overview, risk and KYC, or finance totals",
        super_admin: "the platform overview, risk and KYC, or finance totals",
        guest: "a supported account topic after signing in",
      };
      return deny(
        "INTENT_NOT_SUPPORTED",
        `I couldn't identify a supported question for this role. You can ask about ${examples[actor.actorType]}.`,
      );
    }
  }
}

export function evaluateResourceOwnership(input: {
  actor: AiActorContext;
  owner: AiResourceOwnerScope;
}): AiPolicyDecision {
  if (input.actor.actorType === "user") {
    const matches =
      Boolean(input.actor.userId) &&
      input.owner.userId === input.actor.userId;

    return matches
      ? allow({ tools: [], dataClasses: ["account_private"] })
      : deny("RESOURCE_SCOPE_MISMATCH", "The requested resource is outside this account.");
  }

  if (input.actor.actorType === "merchant") {
    const matches =
      Boolean(input.actor.merchantId) &&
      input.owner.merchantId === input.actor.merchantId;

    return matches
      ? allow({ tools: [], dataClasses: ["merchant_private"] })
      : deny("RESOURCE_SCOPE_MISMATCH", "The requested resource is outside this merchant account.");
  }

  return deny("ACTOR_NOT_SUPPORTED", "Ownership checks are not available for this actor type.");
}
