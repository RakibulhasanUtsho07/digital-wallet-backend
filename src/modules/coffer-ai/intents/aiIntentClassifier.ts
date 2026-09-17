import type {
  AiActorType,
  AiIntentClassification,
  AiPageContextInput,
} from "../types/cofferAi.types.js";

const SECRET_REQUEST_PATTERN =
  /\b(password|passcode|otp|one[- ]?time password|access token|refresh token|api[ _-]?secret|secret key|private key|webhook signing secret)\b|পাসওয়ার্ড|পাসওয়ার্ড|ওটিপি|সিক্রেট/i;

const PAYMENT_PATTERN =
  /\b(payment|transaction|charge|checkout|paid|pending|declined|failed|reversed|refunded)\b|পেমেন্ট|লেনদেন|পেন্ডিং|ব্যর্থ|রিফান্ড/i;

const WALLET_PATTERN =
  /\b(wallet|balance|available balance)\b|ওয়ালেট|ওয়ালেট|ব্যালেন্স/i;

const KYC_PATTERN =
  /\b(kyc|identity verification|verification status)\b|কেওয়াইসি|কেওয়াইসি|ভেরিফিকেশন/i;

const MERCHANT_PATTERN =
  /\b(merchant|checkout|gateway|webhook|settlement|payout|api integration)\b|মার্চেন্ট|গেটওয়ে|গেটওয়ে|ওয়েবহুক|ওয়েবহুক/i;

const RESOURCE_PATTERNS = [
  /\b(?:pay|payment|txn|transaction|ch)_[a-z0-9_-]{6,120}\b/i,
  /\b[0-9a-f]{24}\b/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
];

function cleanResourceId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (
    normalized.length < 6 ||
    normalized.length > 128 ||
    !/^[a-zA-Z0-9_-]+$/.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

function extractResourceId(
  message: string,
  pageContext?: AiPageContextInput,
): string | null {
  const pageResource = cleanResourceId(pageContext?.resourceId);

  if (pageResource) {
    return pageResource;
  }

  for (const pattern of RESOURCE_PATTERNS) {
    const match = message.match(pattern);

    if (match) {
      return cleanResourceId(match[0]);
    }
  }

  return null;
}

export function classifyAiIntent(input: {
  message: string;
  actorType: AiActorType;
  pageContext?: AiPageContextInput;
}): AiIntentClassification {
  const message = input.message.trim();

  if (SECRET_REQUEST_PATTERN.test(message)) {
    return {
      intent: "secret_request",
      confidence: "high",
      resourceId: null,
      needsClarification: false,
      reasonCode: "SECRET_TERM_DETECTED",
    };
  }

  if (PAYMENT_PATTERN.test(message)) {
    const resourceId = extractResourceId(message, input.pageContext);
    const merchantIntent =
      input.actorType === "merchant" || MERCHANT_PATTERN.test(message);

    return {
      intent: merchantIntent
        ? "merchant_payment_diagnosis"
        : "payment_diagnosis",
      confidence: resourceId ? "high" : "medium",
      resourceId,
      needsClarification: !resourceId,
      reasonCode: resourceId
        ? "PAYMENT_RESOURCE_IDENTIFIED"
        : "PAYMENT_RESOURCE_REQUIRED",
    };
  }

  if (WALLET_PATTERN.test(message)) {
    return {
      intent: "wallet_summary",
      confidence: "high",
      resourceId: null,
      needsClarification: false,
      reasonCode: "WALLET_TERM_DETECTED",
    };
  }

  if (KYC_PATTERN.test(message)) {
    return {
      intent: "kyc_status",
      confidence: "high",
      resourceId: null,
      needsClarification: false,
      reasonCode: "KYC_TERM_DETECTED",
    };
  }

  return {
    intent: "unknown",
    confidence: "low",
    resourceId: null,
    needsClarification: true,
    reasonCode: "NO_SUPPORTED_INTENT_MATCH",
  };
}
