import type {
  AiActorType,
  AiIntentClassification,
  AiPageContextInput,
} from "../types/cofferAi.types.js";

const SECRET_REQUEST_PATTERN =
  /\b(password|passcode|otp|one[- ]?time password|access token|refresh token|api[ _-]?secret|secret key|private key|webhook signing secret)\b|পাসওয়ার্ড|পাসওয়ার্ড|ওটিপি|সিক্রেট/i;

const PAYMENT_PATTERN =
  /\b(payment|transaction|charge|checkout|paid|pending|declined|failed|failure|reversed|refunded|refund|transfer|withdrawal|deposit)\b|পেমেন্ট|লেনদেন|পেন্ডিং|ব্যর্থ|ফেইল|রিফান্ড|ট্রানজেকশন|ট্রান্সফার/i;

const WALLET_PATTERN =
  /\b(wallet|balance|available balance|pending balance)\b|ওয়ালেট|ওয়ালেট|ব্যালেন্স/i;

const KYC_PATTERN =
  /\b(kyc|identity verification|verification status)\b|কেওয়াইসি|কেওয়াইসি|ভেরিফিকেশন/i;


const RECEIPT_PATTERN =
  /\b(receipt|purchase receipt|invoice receipt|warranty receipt)\b|রসিদ|রিসিট/i;

const SECURITY_PATTERN =
  /\b(security|security score|2fa|two[- ]factor|failed login|active session|wallet frozen|account protection)\b|সিকিউরিটি|নিরাপত্তা|টু ফ্যাক্টর|২ফা|লগইন ব্যর্থ/i;

const TRANSFER_PATTERN =
  /\b(transfer|send money|sent money|receive money|received money|p2p)\b|ট্রান্সফার|টাকা পাঠানো|টাকা পাঠিয়েছি|টাকা পেয়েছি/i;

const TRANSACTION_LOOKUP_PATTERN =
  /\b(transaction|transaction id|txn|transaction status|transaction detail)\b|লেনদেন|ট্রানজেকশন/i;

const MERCHANT_OVERVIEW_PATTERN =
  /\b(merchant overview|sales overview|gateway overview|business overview|payment performance|merchant performance|payment summary|business summary|sales summary|payment success rate|failed payments|payment volume|gross volume|net revenue|revenue summary|merchant status|merchant verification|verification status|test mode|live mode|live access|test access|live payments)\b|মার্চেন্ট.*(ওভারভিউ|সামারি)|ব্যবসা.*সামারি|পেমেন্ট.*(সামারি|পারফরম্যান্স)|রেভিনিউ.*সামারি/i;

const MERCHANT_PAYMENT_DIAGNOSIS_PATTERN =
  /\b(why|reason|diagnose|investigate|check payment|payment status|failed|failure|declined|pending|stuck|expired|cancelled|payment id|payment reference)\b|কেন|কারণ|ফেইল|ব্যর্থ|ডিক্লাইন|পেন্ডিং|পেমেন্ট.*(আইডি|রেফারেন্স|স্ট্যাটাস)/i;

const MERCHANT_REFUND_PATTERN =
  /\b(refund|refunds|refunded|refund summary|refund status|refund activity)\b|রিফান্ড|রিফান্ড.*(সামারি|স্ট্যাটাস)/i;

const MERCHANT_PAYOUT_PATTERN =
  /\b(payout|payouts|payout summary|payout status|available payout|reserved payout|bank payout)\b|পেআউট|পেআউট.*(সামারি|স্ট্যাটাস)/i;

const MERCHANT_SETTLEMENT_PATTERN =
  /\b(settlement|settlements|settled|settlement summary|reconciliation|reconcile)\b|সেটেলমেন্ট|রিকনসিলিয়েশন|রিকনসিলিয়েশন/i;

const MERCHANT_WEBHOOK_PATTERN =
  /\b(webhook|webhooks|webhook delivery|delivery event|delivery events|endpoint delivery|webhook failure|failed webhook)\b|ওয়েবহুক|ওয়েবহুক/i;

const MERCHANT_API_KEY_PATTERN =
  /\b(api key|api keys|key metadata|key status|key scopes?|test key|live key|credential metadata)\b|এপিআই কী|এপিআই কি/i;

const MERCHANT_ANALYTICS_PATTERN =
  /\b(analytics|payment analytics|business analytics|trend|trends|payment trend|performance trend|conversion|success rate breakdown|failure rate|provider breakdown|payment method breakdown|top days?)\b|অ্যানালিটিক্স|এনালিটিক্স|ট্রেন্ড|কনভার্সন/i;

const MERCHANT_DIAGNOSIS_PATTERN =
  /\b(why|reason|diagnose|diagnosis|investigate|failed|failure|error|stuck|not working|not delivered|declined|rejected|cannot|can't|problem|issue)\b|কেন|কারণ|ডায়াগনোস|ডায়াগনোস|তদন্ত|ব্যর্থ|ফেইল|এরর|সমস্যা|কাজ করছে না/i;

const MERCHANT_API_DIAGNOSIS_PATTERN =
  /\b(api error|api failure|401|403|404|409|422|429|500|unauthorized|forbidden|scope|permission|wrong environment|invalid key|expired key|revoked key)\b|এপিআই.*(এরর|ফেইল|সমস্যা)|স্কোপ|পারমিশন/i;

const SUPPORT_OPERATIONS_PATTERN =
  /\b(support queue|support overview|ticket queue|ticket summary|sla|escalat|open tickets|support performance)\b|সাপোর্ট.*(কিউ|ওভারভিউ|সামারি)|টিকেট.*(কিউ|সামারি)|এসএলএ|এস্কেলেশন/i;

const SUPPORT_LOOKUP_PATTERN =
  /\b(find|lookup|look up|check|investigate|customer|user|name|email|payment id|transaction id|reference|why|reason|failed|pending)\b|খুঁজ|চেক|দেখ|কারণ|কেন|নাম|ইমেইল|পেমেন্ট|লেনদেন|ট্রানজেকশন/i;

const ANALYST_PATTERN =
  /\b(wallet analytics|wallet network|wallet adoption|wallet engagement)\b|ওয়ালেট অ্যানালিটিক্স/i;

const ADMIN_PATTERN =
  /\b(admin overview|platform overview|platform health|executive overview)\b|প্ল্যাটফর্ম ওভারভিউ/i;

const ANALYST_RISK_PATTERN = /\b(risk|fraud|blocked|high.risk)\b|ঝুঁকি|রিস্ক|ফ্রড/i;
const ANALYST_PAYMENT_PATTERN = /\b(payment|payments|success rate|failure rate|gateway|provider)\b|পেমেন্ট|পেমেন্টের|গেটওয়ে/i;
const ANALYST_REVENUE_PATTERN = /\b(revenue|fee|fees|leakage|earnings)\b|রেভিনিউ|ফি|আয়|লিকেজ/i;
const ANALYST_WALLET_PATTERN = /\b(wallet|wallets|engagement|adoption)\b|ওয়ালেট/i;
const ADMIN_RISK_PATTERN = /\b(risk|alerts|kyc|verification|security|attention)\b|রিস্ক|ঝুঁকি|কেওয়াইসি|অ্যালার্ট|নিরাপত্তা/i;
const ADMIN_FINANCE_PATTERN = /\b(revenue|fee|finance|volume|transactions|payments)\b|রেভিনিউ|আয়|ফি|লেনদেন|পেমেন্ট/i;

const RESOURCE_PATTERNS = [
  /\b(?:pay|payment|txn|transaction|ch|re|refund|payout|settlement|evt|event|key)_[a-z0-9_-]{4,120}\b/i,
  /\b[0-9a-f]{24}\b/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
];

function cleanResourceId(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim();

  if (
    normalized.length < 6 ||
    normalized.length > 128 ||
    !/^[a-zA-Z0-9_-]+$/.test(normalized)
  ) {
    return null;
  }

  // Do not treat documentation/UI placeholders as real financial resources.
  // This prevents prompts such as <REFUND_ID> or YOUR_PAYOUT_ID from being
  // routed as an owned resource lookup.
  const placeholder = normalized.toUpperCase();

  if (
    /^(?:YOUR_)?(?:PAYMENT|TRANSACTION|TXN|REFUND|PAYOUT|SETTLEMENT|EVENT|WEBHOOK_EVENT|KEY|API_KEY|RESOURCE)_ID$/.test(
      placeholder,
    )
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

  if (pageResource) return pageResource;

  for (const pattern of RESOURCE_PATTERNS) {
    const match = message.match(pattern);
    if (match) return cleanResourceId(match[0]);
  }

  return null;
}

export function classifyAiIntent(input: {
  message: string;
  actorType: AiActorType;
  pageContext?: AiPageContextInput;
}): AiIntentClassification {
  const message = input.message.trim();
  const route = input.pageContext?.route ?? "";

  if (SECRET_REQUEST_PATTERN.test(message)) {
    return {
      intent: "secret_request",
      confidence: "high",
      resourceId: null,
      needsClarification: false,
      reasonCode: "SECRET_TERM_DETECTED",
    };
  }

  if (input.actorType === "support") {
    if (
      SUPPORT_OPERATIONS_PATTERN.test(message) &&
      !PAYMENT_PATTERN.test(message)
    ) {
      return {
        intent: "support_operations_summary",
        confidence: "high",
        resourceId: null,
        needsClarification: false,
        reasonCode: "SUPPORT_OPERATIONS_REQUEST",
      };
    }

    // Support is a first-line operational copilot. After the explicit
    // operations-summary intent above, every other support message is routed
    // to the read-only investigation tool. This lets an agent paste only a
    // payment ID, transaction ID, customer email, phone, ID, or plain name.
    return {
      intent: "support_investigation",
      confidence:
        extractResourceId(message, input.pageContext) ||
        PAYMENT_PATTERN.test(message) ||
        SUPPORT_LOOKUP_PATTERN.test(message)
          ? "high"
          : "medium",
      resourceId: extractResourceId(message, input.pageContext),
      needsClarification: false,
      reasonCode: "SUPPORT_INVESTIGATION_REQUEST",
    };
  }

  if (input.actorType === "user" && SECURITY_PATTERN.test(message)) {
    return {
      intent: "security_summary",
      confidence: "high",
      resourceId: null,
      needsClarification: false,
      reasonCode: "SECURITY_SUMMARY_REQUEST",
    };
  }

  if (input.actorType === "user" && RECEIPT_PATTERN.test(message)) {
    const resourceId = extractResourceId(message, input.pageContext);

    return {
      intent: "receipt_lookup",
      confidence: resourceId ? "high" : "medium",
      resourceId,
      needsClarification: !resourceId,
      reasonCode: resourceId
        ? "RECEIPT_RESOURCE_IDENTIFIED"
        : "RECEIPT_RESOURCE_REQUIRED",
    };
  }

  if (input.actorType === "user" && TRANSFER_PATTERN.test(message)) {
    const resourceId = extractResourceId(message, input.pageContext);

    return {
      intent: "transfer_diagnosis",
      confidence: resourceId ? "high" : "medium",
      resourceId,
      needsClarification: !resourceId,
      reasonCode: resourceId
        ? "TRANSFER_RESOURCE_IDENTIFIED"
        : "TRANSFER_RESOURCE_REQUIRED",
    };
  }

  if (input.actorType === "user" && TRANSACTION_LOOKUP_PATTERN.test(message)) {
    const resourceId = extractResourceId(message, input.pageContext);

    return {
      intent: "transaction_lookup",
      confidence: resourceId ? "high" : "medium",
      resourceId,
      needsClarification: !resourceId,
      reasonCode: resourceId
        ? "TRANSACTION_RESOURCE_IDENTIFIED"
        : "TRANSACTION_RESOURCE_REQUIRED",
    };
  }

  if (input.actorType === "merchant") {
    const resourceId = extractResourceId(message, input.pageContext);

    // Phase 3: a diagnostic request is routed to a detail tool when the
    // message asks "why" / "failed" / "error" or supplies an exact owned
    // resource reference. Summary requests continue to use the aggregate
    // tools from Phase 2.
    if (MERCHANT_REFUND_PATTERN.test(message)) {
      const diagnostic =
        Boolean(resourceId) || MERCHANT_DIAGNOSIS_PATTERN.test(message);

      return diagnostic
        ? {
            intent: "merchant_refund_diagnosis",
            confidence: resourceId ? "high" : "medium",
            resourceId,
            needsClarification: !resourceId,
            reasonCode: resourceId
              ? "MERCHANT_REFUND_RESOURCE_IDENTIFIED"
              : "MERCHANT_REFUND_RESOURCE_REQUIRED",
          }
        : {
            intent: "merchant_refund_summary",
            confidence: "high",
            resourceId: null,
            needsClarification: false,
            reasonCode: "MERCHANT_REFUND_SUMMARY_REQUEST",
          };
    }

    if (MERCHANT_PAYOUT_PATTERN.test(message)) {
      const diagnostic =
        Boolean(resourceId) || MERCHANT_DIAGNOSIS_PATTERN.test(message);

      return diagnostic
        ? {
            intent: "merchant_payout_diagnosis",
            confidence: resourceId ? "high" : "medium",
            resourceId,
            needsClarification: !resourceId,
            reasonCode: resourceId
              ? "MERCHANT_PAYOUT_RESOURCE_IDENTIFIED"
              : "MERCHANT_PAYOUT_RESOURCE_REQUIRED",
          }
        : {
            intent: "merchant_payout_summary",
            confidence: "high",
            resourceId: null,
            needsClarification: false,
            reasonCode: "MERCHANT_PAYOUT_SUMMARY_REQUEST",
          };
    }

    if (MERCHANT_SETTLEMENT_PATTERN.test(message)) {
      const diagnostic =
        Boolean(resourceId) || MERCHANT_DIAGNOSIS_PATTERN.test(message);

      return diagnostic
        ? {
            intent: "merchant_settlement_diagnosis",
            confidence: resourceId ? "high" : "medium",
            resourceId,
            needsClarification: !resourceId,
            reasonCode: resourceId
              ? "MERCHANT_SETTLEMENT_RESOURCE_IDENTIFIED"
              : "MERCHANT_SETTLEMENT_RESOURCE_REQUIRED",
          }
        : {
            intent: "merchant_settlement_summary",
            confidence: "high",
            resourceId: null,
            needsClarification: false,
            reasonCode: "MERCHANT_SETTLEMENT_SUMMARY_REQUEST",
          };
    }

    if (MERCHANT_WEBHOOK_PATTERN.test(message)) {
      const diagnostic =
        Boolean(resourceId) || MERCHANT_DIAGNOSIS_PATTERN.test(message);

      return diagnostic
        ? {
            intent: "merchant_webhook_diagnosis",
            confidence: resourceId ? "high" : "medium",
            resourceId,
            needsClarification: !resourceId,
            reasonCode: resourceId
              ? "MERCHANT_WEBHOOK_RESOURCE_IDENTIFIED"
              : "MERCHANT_WEBHOOK_RESOURCE_REQUIRED",
          }
        : {
            intent: "merchant_webhook_summary",
            confidence: "high",
            resourceId: null,
            needsClarification: false,
            reasonCode: "MERCHANT_WEBHOOK_SUMMARY_REQUEST",
          };
    }

    if (MERCHANT_API_KEY_PATTERN.test(message)) {
      const diagnostic =
        Boolean(resourceId) ||
        MERCHANT_DIAGNOSIS_PATTERN.test(message) ||
        MERCHANT_API_DIAGNOSIS_PATTERN.test(message);

      return diagnostic
        ? {
            intent: "merchant_api_key_diagnosis",
            confidence: resourceId ? "high" : "medium",
            resourceId,
            needsClarification: !resourceId,
            reasonCode: resourceId
              ? "MERCHANT_API_KEY_RESOURCE_IDENTIFIED"
              : "MERCHANT_API_KEY_RESOURCE_REQUIRED",
          }
        : {
            intent: "merchant_api_key_summary",
            confidence: "high",
            resourceId: null,
            needsClarification: false,
            reasonCode: "MERCHANT_API_KEY_SUMMARY_REQUEST",
          };
    }

    if (MERCHANT_ANALYTICS_PATTERN.test(message)) {
      return {
        intent: "merchant_analytics_summary",
        confidence: "high",
        resourceId: null,
        needsClarification: false,
        reasonCode: "MERCHANT_ANALYTICS_SUMMARY_REQUEST",
      };
    }

    if (
      MERCHANT_OVERVIEW_PATTERN.test(message) &&
      !resourceId
    ) {
      return {
        intent: "merchant_overview",
        confidence: "high",
        resourceId: null,
        needsClarification: false,
        reasonCode: "MERCHANT_OVERVIEW_REQUEST",
      };
    }

    if (
      PAYMENT_PATTERN.test(message) &&
      (Boolean(resourceId) ||
        MERCHANT_PAYMENT_DIAGNOSIS_PATTERN.test(message))
    ) {
      return {
        intent: "merchant_payment_diagnosis",
        confidence: resourceId ? "high" : "medium",
        resourceId,
        needsClarification: !resourceId,
        reasonCode: resourceId
          ? "MERCHANT_PAYMENT_RESOURCE_IDENTIFIED"
          : "MERCHANT_PAYMENT_RESOURCE_REQUIRED",
      };
    }
  }

  if (PAYMENT_PATTERN.test(message)) {
    const resourceId = extractResourceId(message, input.pageContext);

    if (input.actorType === "user") {
      return {
        intent: "payment_diagnosis",
        confidence: resourceId ? "high" : "medium",
        resourceId,
        needsClarification: !resourceId,
        reasonCode: resourceId
          ? "PAYMENT_RESOURCE_IDENTIFIED"
          : "PAYMENT_RESOURCE_REQUIRED",
      };
    }
  }

  if (input.actorType === "user" && KYC_PATTERN.test(message)) {
    return {
      intent: "kyc_status",
      confidence: "high",
      resourceId: null,
      needsClarification: false,
      reasonCode: "KYC_REQUEST",
    };
  }

  if (
    input.actorType === "user" &&
    (WALLET_PATTERN.test(message) || route.includes("/wallet"))
  ) {
    return {
      intent: "wallet_summary",
      confidence: "high",
      resourceId: null,
      needsClarification: false,
      reasonCode: "WALLET_REQUEST",
    };
  }

  if (input.actorType === "analyst") {
    const intent = ANALYST_RISK_PATTERN.test(message)
      ? "analyst_risk_snapshot" as const
      : ANALYST_REVENUE_PATTERN.test(message)
        ? "analyst_revenue_snapshot" as const
        : ANALYST_PAYMENT_PATTERN.test(message)
          ? "analyst_payment_snapshot" as const
          : ANALYST_WALLET_PATTERN.test(message) || ANALYST_PATTERN.test(message)
            ? "analyst_wallet_snapshot" as const
            : null;
    if (intent) return {
      intent,
      confidence: "high",
      resourceId: null,
      needsClarification: false,
      reasonCode: "ANALYST_AGGREGATE_REQUEST",
    };
  }

  if (input.actorType === "admin" || input.actorType === "super_admin") {
    const intent = ADMIN_RISK_PATTERN.test(message)
      ? "admin_risk_snapshot" as const
      : ADMIN_FINANCE_PATTERN.test(message)
        ? "admin_finance_snapshot" as const
        : ADMIN_PATTERN.test(message) || /\b(overview|users|wallets|platform)\b|ওভারভিউ|ব্যবহারকারী|প্ল্যাটফর্ম/i.test(message)
          ? "admin_platform_overview" as const
          : null;
    if (intent) return {
      intent,
      confidence: "high",
      resourceId: null,
      needsClarification: false,
      reasonCode: "ADMIN_AGGREGATE_REQUEST",
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
