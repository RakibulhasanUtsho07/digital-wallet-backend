export type SupportPlaybookId =
  | "provider_timeout"
  | "provider_decline"
  | "insufficient_funds"
  | "authentication_failed"
  | "payment_expired"
  | "duplicate_payment"
  | "risk_blocked"
  | "wallet_restricted"
  | "kyc_rejected"
  | "unknown_payment_failure";

export type SupportPlaybookStepKind =
  | "verify"
  | "explain"
  | "customer_action"
  | "internal_review"
  | "escalate"
  | "document";

export interface SupportPlaybookStep {
  id: string;
  order: number;
  kind: SupportPlaybookStepKind;
  title: string;
  instruction: string;
  required: boolean;
  safeCustomerFacing: boolean;
  requiresHumanConfirmation: boolean;
  prohibitedActions?: string[];
}

export interface SupportPlaybookDefinition {
  id: SupportPlaybookId;
  title: string;
  description: string;
  appliesToCauseCodes: string[];
  appliesToSignalCodes: string[];
  defaultQueue:
    | "support"
    | "payments"
    | "provider"
    | "risk_security"
    | "kyc"
    | "engineering";
  customerMessageTemplate: string;
  steps: SupportPlaybookStep[];
}

const COMMON_PROHIBITED = [
  "Do not ask for or expose OTPs, passwords, authentication tokens, API secrets, or full payment credentials.",
  "Do not override wallet, KYC, risk, or security controls.",
  "Do not promise a refund, reversal, success, or provider outcome that is not confirmed in backend evidence.",
];

const DEFINITIONS: SupportPlaybookDefinition[] = [
  {
    id: "provider_timeout",
    title: "Provider Timeout / Provider Error",
    description:
      "Use when the payment or payment-attempt evidence records a provider timeout, provider error, network error, or temporary provider unavailability.",
    appliesToCauseCodes: [
      "provider_timeout",
      "provider_error",
      "timeout",
      "network_error",
      "bank_unavailable",
    ],
    appliesToSignalCodes: [
      "provider_transaction_non_success",
      "payment_attempt_failure",
    ],
    defaultQueue: "provider",
    customerMessageTemplate:
      "The payment provider did not complete the request normally. Please avoid repeated rapid retries. Wait briefly and try once more. If the same issue repeats, Support will escalate the payment reference for provider review.",
    steps: [
      {
        id: "verify-reference",
        order: 1,
        kind: "verify",
        title: "Verify the exact payment reference",
        instruction:
          "Confirm the customer is referring to the same payment/payment-attempt reference shown in the case evidence.",
        required: true,
        safeCustomerFacing: false,
        requiresHumanConfirmation: true,
      },
      {
        id: "verify-provider-evidence",
        order: 2,
        kind: "verify",
        title: "Verify provider-side evidence",
        instruction:
          "Confirm the recorded failure code/status is provider_timeout/provider_error/network-related. If no direct provider evidence exists, do not use this playbook as the confirmed cause.",
        required: true,
        safeCustomerFacing: false,
        requiresHumanConfirmation: true,
      },
      {
        id: "explain-temporary-failure",
        order: 3,
        kind: "explain",
        title: "Explain the verified temporary provider failure",
        instruction:
          "Tell the customer the provider did not complete the request normally. Do not claim the provider is down platform-wide unless an incident/alert proves that broader pattern.",
        required: true,
        safeCustomerFacing: true,
        requiresHumanConfirmation: true,
      },
      {
        id: "single-safe-retry",
        order: 4,
        kind: "customer_action",
        title: "Recommend one safe retry",
        instruction:
          "Ask the customer to wait briefly, then retry once. Avoid repeated rapid retries because they can create confusing duplicate attempts.",
        required: true,
        safeCustomerFacing: true,
        requiresHumanConfirmation: true,
      },
      {
        id: "provider-escalation",
        order: 5,
        kind: "escalate",
        title: "Escalate if the issue repeats",
        instruction:
          "If another attempt fails with the same provider evidence, escalate to the provider/payments queue with the payment ID, attempt ID, provider transaction ID, timestamps, and verified failure code.",
        required: false,
        safeCustomerFacing: false,
        requiresHumanConfirmation: true,
        prohibitedActions: [
          "Do not change provider routing from the Support AI workflow.",
          "Do not retry the payment server-side automatically.",
        ],
      },
    ],
  },
  {
    id: "provider_decline",
    title: "Issuer / Provider Decline",
    description:
      "Use when evidence records a declined/card_declined/declined_by_bank style failure.",
    appliesToCauseCodes: [
      "declined",
      "card_declined",
      "declined_by_bank",
    ],
    appliesToSignalCodes: [],
    defaultQueue: "support",
    customerMessageTemplate:
      "The payment method was declined by the provider or issuer. Please verify the payment method and try once more, or use another eligible payment method. If it is repeatedly declined, contact the issuer/provider.",
    steps: [
      {
        id: "confirm-decline",
        order: 1,
        kind: "verify",
        title: "Confirm the recorded decline",
        instruction:
          "Verify the payment/payment-attempt has a recorded decline code. Do not infer a bank decline from a generic failed status.",
        required: true,
        safeCustomerFacing: false,
        requiresHumanConfirmation: true,
      },
      {
        id: "explain-decline",
        order: 2,
        kind: "explain",
        title: "Explain the decline safely",
        instruction:
          "Tell the customer the payment method was declined by the provider/issuer. Do not claim the exact issuer reason unless the backend stores it.",
        required: true,
        safeCustomerFacing: true,
        requiresHumanConfirmation: true,
      },
      {
        id: "alternative-method",
        order: 3,
        kind: "customer_action",
        title: "Offer a safe next payment option",
        instruction:
          "Ask the customer to verify the payment method and retry once, or use another eligible method. Repeated issuer declines should be handled by the issuer/provider.",
        required: true,
        safeCustomerFacing: true,
        requiresHumanConfirmation: true,
      },
      {
        id: "document-repeat",
        order: 4,
        kind: "document",
        title: "Document repeated declines",
        instruction:
          "If the decline repeats, record the affected payment references and timestamps before closing or escalating the case.",
        required: false,
        safeCustomerFacing: false,
        requiresHumanConfirmation: true,
      },
    ],
  },
  {
    id: "insufficient_funds",
    title: "Insufficient Funds",
    description:
      "Use only when the backend records insufficient_funds or equivalent direct payment-attempt evidence.",
    appliesToCauseCodes: ["insufficient_funds"],
    appliesToSignalCodes: [],
    defaultQueue: "support",
    customerMessageTemplate:
      "The payment source reported insufficient funds. Please verify the available balance or use another eligible payment source before trying again.",
    steps: [
      {
        id: "verify-insufficient-funds",
        order: 1,
        kind: "verify",
        title: "Verify the recorded cause",
        instruction:
          "Confirm insufficient_funds is recorded in payment/payment-attempt evidence.",
        required: true,
        safeCustomerFacing: false,
        requiresHumanConfirmation: true,
      },
      {
        id: "explain-balance",
        order: 2,
        kind: "explain",
        title: "Explain the funding issue",
        instruction:
          "Tell the customer the payment source reported insufficient funds. Do not disclose unrelated wallet/account balances unless the customer is authorized and the UI policy allows it.",
        required: true,
        safeCustomerFacing: true,
        requiresHumanConfirmation: true,
      },
      {
        id: "customer-funding-action",
        order: 3,
        kind: "customer_action",
        title: "Ask the customer to verify funds",
        instruction:
          "Ask the customer to verify available funds or use another eligible payment source before a new attempt.",
        required: true,
        safeCustomerFacing: true,
        requiresHumanConfirmation: true,
      },
    ],
  },
  {
    id: "authentication_failed",
    title: "Payment Authentication / Verification Failed",
    description:
      "Use when payment authentication failed or checkout verification was not completed.",
    appliesToCauseCodes: [
      "authentication_failed",
    ],
    appliesToSignalCodes: [
      "checkout_verification_not_completed",
      "checkout_verification_attempt_limit",
    ],
    defaultQueue: "support",
    customerMessageTemplate:
      "The payment did not complete because the required verification step was not completed successfully. Please start a fresh checkout and complete the verification step.",
    steps: [
      {
        id: "verify-auth-state",
        order: 1,
        kind: "verify",
        title: "Verify the failed or expired verification state",
        instruction:
          "Confirm authentication_failed or an unconsumed/expired checkout verification challenge is present in backend evidence.",
        required: true,
        safeCustomerFacing: false,
        requiresHumanConfirmation: true,
      },
      {
        id: "fresh-checkout",
        order: 2,
        kind: "customer_action",
        title: "Ask for a fresh checkout",
        instruction:
          "Ask the customer to begin a fresh checkout and complete the verification step from their own device/session.",
        required: true,
        safeCustomerFacing: true,
        requiresHumanConfirmation: true,
        prohibitedActions: [
          "Never ask the customer to send an OTP or verification code to Support.",
          "Never reveal verification hashes or identifiers.",
        ],
      },
      {
        id: "repeat-auth-failure",
        order: 3,
        kind: "escalate",
        title: "Escalate repeated authentication failures",
        instruction:
          "If fresh verification repeatedly fails, escalate the payment reference and challenge metadata that is safe to share internally. Do not include OTP/code values.",
        required: false,
        safeCustomerFacing: false,
        requiresHumanConfirmation: true,
      },
    ],
  },
  {
    id: "payment_expired",
    title: "Expired Payment Attempt",
    description:
      "Use when the payment/checkout attempt is recorded as expired.",
    appliesToCauseCodes: ["expired"],
    appliesToSignalCodes: [],
    defaultQueue: "support",
    customerMessageTemplate:
      "The previous payment attempt expired before completion. Please start a new payment attempt.",
    steps: [
      {
        id: "confirm-expiry",
        order: 1,
        kind: "verify",
        title: "Confirm the attempt expired",
        instruction:
          "Verify the payment status or failure code records expiry.",
        required: true,
        safeCustomerFacing: false,
        requiresHumanConfirmation: true,
      },
      {
        id: "new-attempt",
        order: 2,
        kind: "customer_action",
        title: "Start a new payment attempt",
        instruction:
          "Ask the customer to start a new checkout/payment attempt. Do not attempt to revive an expired payment from the Support workflow.",
        required: true,
        safeCustomerFacing: true,
        requiresHumanConfirmation: true,
      },
    ],
  },
  {
    id: "duplicate_payment",
    title: "Duplicate Payment / Duplicate Attempt",
    description:
      "Use only when the backend records duplicate/duplicate_payment evidence or a case has the same exact payment reference duplicated.",
    appliesToCauseCodes: [
      "duplicate",
      "duplicate_payment",
    ],
    appliesToSignalCodes: [
      "existing_support_case",
    ],
    defaultQueue: "payments",
    customerMessageTemplate:
      "A duplicate payment/attempt condition is recorded. Please do not create another payment while Support verifies which reference reached a final state.",
    steps: [
      {
        id: "verify-duplicate",
        order: 1,
        kind: "verify",
        title: "Verify duplicate evidence",
        instruction:
          "Confirm there are two distinct payment/attempt records or an explicit duplicate failure code. Do not call repeated retries duplicates unless the records prove it.",
        required: true,
        safeCustomerFacing: false,
        requiresHumanConfirmation: true,
      },
      {
        id: "stop-new-attempts",
        order: 2,
        kind: "customer_action",
        title: "Prevent additional duplicate attempts",
        instruction:
          "Ask the customer not to submit another payment until Support confirms the final state of the existing references.",
        required: true,
        safeCustomerFacing: true,
        requiresHumanConfirmation: true,
      },
      {
        id: "compare-final-states",
        order: 3,
        kind: "verify",
        title: "Compare final states",
        instruction:
          "Check each payment/attempt/provider reference and identify which ones are completed, failed, pending, cancelled, or expired.",
        required: true,
        safeCustomerFacing: false,
        requiresHumanConfirmation: true,
      },
      {
        id: "payments-review",
        order: 4,
        kind: "escalate",
        title: "Escalate charge duplication for payments review",
        instruction:
          "If more than one payment appears completed/charged, route to the authorized payments/refund workflow. The AI playbook does not issue a refund itself.",
        required: false,
        safeCustomerFacing: false,
        requiresHumanConfirmation: true,
        prohibitedActions: [
          "Do not issue or promise a refund from the AI playbook.",
          "Do not cancel a settled transaction from the Support AI workflow.",
        ],
      },
    ],
  },
  {
    id: "risk_blocked",
    title: "Risk / Security Block",
    description:
      "Use when a payment has a verified risk_blocked cause or security control is the direct recorded blocker.",
    appliesToCauseCodes: ["risk_blocked"],
    appliesToSignalCodes: [
      "transaction_high_risk",
      "recent_security_warning",
    ],
    defaultQueue: "risk_security",
    customerMessageTemplate:
      "The payment requires additional internal review. Support cannot override this control, but the case can be routed to the authorized review team.",
    steps: [
      {
        id: "verify-risk-block",
        order: 1,
        kind: "verify",
        title: "Verify the direct risk/security block",
        instruction:
          "Confirm risk_blocked is direct payment evidence. A HIGH risk score by itself is context, not the confirmed cause.",
        required: true,
        safeCustomerFacing: false,
        requiresHumanConfirmation: true,
      },
      {
        id: "no-override",
        order: 2,
        kind: "internal_review",
        title: "Do not override the security control",
        instruction:
          "Keep the control intact. Support must not bypass, disable, or reveal internal risk logic.",
        required: true,
        safeCustomerFacing: false,
        requiresHumanConfirmation: true,
        prohibitedActions: COMMON_PROHIBITED,
      },
      {
        id: "risk-escalation",
        order: 3,
        kind: "escalate",
        title: "Escalate to authorized Risk/Security review",
        instruction:
          "Route the case with the payment/transaction references and support-safe evidence to Risk/Security.",
        required: true,
        safeCustomerFacing: false,
        requiresHumanConfirmation: true,
      },
    ],
  },
  {
    id: "wallet_restricted",
    title: "Wallet Restricted / Frozen",
    description:
      "Use when the account wallet is frozen/blocked. Treat it as account context unless direct payment evidence proves it caused the payment failure.",
    appliesToCauseCodes: [],
    appliesToSignalCodes: ["wallet_restricted"],
    defaultQueue: "risk_security",
    customerMessageTemplate:
      "The wallet currently has a restriction that Support cannot override. The case needs authorized account/security review.",
    steps: [
      {
        id: "verify-wallet-state",
        order: 1,
        kind: "verify",
        title: "Verify wallet restriction",
        instruction:
          "Confirm the current wallet status is frozen/blocked from the authoritative wallet record.",
        required: true,
        safeCustomerFacing: false,
        requiresHumanConfirmation: true,
      },
      {
        id: "separate-context-from-cause",
        order: 2,
        kind: "explain",
        title: "Separate account context from payment cause",
        instruction:
          "If the payment does not record wallet restriction as the cause, explain internally that the wallet restriction is relevant context, not a proven payment-failure cause.",
        required: true,
        safeCustomerFacing: false,
        requiresHumanConfirmation: true,
      },
      {
        id: "security-review",
        order: 3,
        kind: "escalate",
        title: "Route wallet restriction for authorized review",
        instruction:
          "Route to Risk/Security. Support and Coffer AI must not unfreeze/unblock the wallet.",
        required: true,
        safeCustomerFacing: false,
        requiresHumanConfirmation: true,
        prohibitedActions: COMMON_PROHIBITED,
      },
    ],
  },
  {
    id: "kyc_rejected",
    title: "KYC Rejected / Verification Review",
    description:
      "Use when KYC is rejected. KYC status remains account context unless a payment rule directly records KYC as the payment blocker.",
    appliesToCauseCodes: [],
    appliesToSignalCodes: ["kyc_rejected"],
    defaultQueue: "kyc",
    customerMessageTemplate:
      "Your account verification needs review. Support can explain the recorded verification status and route the case through the authorized KYC process.",
    steps: [
      {
        id: "verify-kyc-state",
        order: 1,
        kind: "verify",
        title: "Verify KYC status",
        instruction:
          "Confirm the current KYC record is rejected and use only the recorded support-safe rejection reason if present.",
        required: true,
        safeCustomerFacing: false,
        requiresHumanConfirmation: true,
      },
      {
        id: "explain-known-reason",
        order: 2,
        kind: "explain",
        title: "Explain only the recorded KYC reason",
        instruction:
          "Share only the support-safe recorded verification reason. Do not invent a missing reason or expose document numbers/images.",
        required: true,
        safeCustomerFacing: true,
        requiresHumanConfirmation: true,
      },
      {
        id: "kyc-route",
        order: 3,
        kind: "escalate",
        title: "Route through authorized KYC workflow",
        instruction:
          "Route the account to the approved KYC review/resubmission flow. Support AI must not approve/reject KYC itself.",
        required: true,
        safeCustomerFacing: false,
        requiresHumanConfirmation: true,
        prohibitedActions: [
          "Do not approve or reject KYC from the AI Support playbook.",
          "Do not expose identity document numbers or images.",
        ],
      },
    ],
  },
  {
    id: "unknown_payment_failure",
    title: "Failed Payment — Exact Cause Not Proven",
    description:
      "Use when payment/transaction failure is confirmed but no exact failure cause is proven by available evidence.",
    appliesToCauseCodes: [],
    appliesToSignalCodes: [],
    defaultQueue: "payments",
    customerMessageTemplate:
      "The payment is confirmed as unsuccessful, but the exact cause is not recorded in the available evidence. Support will keep the payment reference and route it for further review rather than guessing.",
    steps: [
      {
        id: "confirm-failed-state",
        order: 1,
        kind: "verify",
        title: "Confirm the non-success final state",
        instruction:
          "Verify the payment/transaction is actually failed/cancelled and not still pending, authorized, captured, or completed.",
        required: true,
        safeCustomerFacing: false,
        requiresHumanConfirmation: true,
      },
      {
        id: "state-unknown-cause",
        order: 2,
        kind: "explain",
        title: "State that the exact cause is unknown",
        instruction:
          "Tell the customer Support can confirm the unsuccessful state, but the exact cause is not stored in current evidence.",
        required: true,
        safeCustomerFacing: true,
        requiresHumanConfirmation: true,
      },
      {
        id: "collect-safe-evidence",
        order: 3,
        kind: "document",
        title: "Collect safe internal references",
        instruction:
          "Record payment ID, transaction ID, payment attempt ID, provider transaction ID, timestamps, and current status. Do not collect secrets/OTPs/payment credentials.",
        required: true,
        safeCustomerFacing: false,
        requiresHumanConfirmation: true,
      },
      {
        id: "payments-escalation",
        order: 4,
        kind: "escalate",
        title: "Escalate without guessing",
        instruction:
          "Route to Payments/Provider/Engineering according to case triage and state conflicts. Include the collected evidence.",
        required: true,
        safeCustomerFacing: false,
        requiresHumanConfirmation: true,
      },
    ],
  },
];

export function listSupportPlaybooks(): SupportPlaybookDefinition[] {
  return DEFINITIONS.map((definition) => ({
    ...definition,
    appliesToCauseCodes: [...definition.appliesToCauseCodes],
    appliesToSignalCodes: [...definition.appliesToSignalCodes],
    steps: definition.steps.map((step) => ({
      ...step,
      prohibitedActions: step.prohibitedActions
        ? [...step.prohibitedActions]
        : undefined,
    })),
  }));
}

export function getSupportPlaybook(
  id: string,
): SupportPlaybookDefinition | null {
  const normalized = id.trim().toLowerCase();
  return listSupportPlaybooks().find(
    (definition) => definition.id === normalized,
  ) ?? null;
}
