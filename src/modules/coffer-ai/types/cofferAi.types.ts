export type AiActorType =
  | "guest"
  | "user"
  | "merchant"
  | "support"
  | "analyst"
  | "admin"
  | "super_admin";

export type AiAccountState =
  | "active"
  | "pending"
  | "suspended"
  | "disabled"
  | "locked"
  | "unknown";

export type AiKycState =
  | "not_started"
  | "pending"
  | "under_review"
  | "verified"
  | "rejected"
  | "unknown";

export type AiMerchantVerificationState =
  | "not_started"
  | "pending"
  | "verified"
  | "rejected"
  | "unknown";

export type AiEnvironmentMode =
  | "test"
  | "live"
  | "unknown";

export type AiCapability =
  | "profile:read:self"
  | "kyc:read:self"
  | "wallet:read:self"
  | "payment:read:self"
  | "transaction:read:self"
  | "receipt:read:self"
  | "security:read:self"
  | "merchant:profile:read:self"
  | "merchant:payment:read:self"
  | "merchant:refund:read:self"
  | "merchant:payout:read:self"
  | "merchant:settlement:read:self"
  | "merchant:webhook:read:self"
  | "merchant:api_key:read:self"
  | "merchant:analytics:read:self"
  | "support:operations:read"
  | "support:customer:search"
  | "support:payment:read"
  | "support:transaction:read"
  | "analyst:wallet:read"
  | "analyst:payment:read"
  | "analyst:risk:read"
  | "analyst:revenue:read"
  | "admin:platform:read";

export type AiDataClass =
  | "public"
  | "account_private"
  | "merchant_private"
  | "support_private"
  | "aggregate_private"
  | "restricted"
  | "secret"
  | "auth_secret";

export interface TrustedUserPrincipal {
  _id?: unknown;
  id?: unknown;
  userId?: unknown;
  role?: unknown;
  status?: unknown;
  accountStatus?: unknown;
  kycStatus?: unknown;
  merchantId?: unknown;
}

export interface TrustedMerchantPrincipal {
  _id?: unknown;
  id?: unknown;
  merchantId?: unknown;
  status?: unknown;
  verificationStatus?: unknown;
  mode?: unknown;
  environment?: unknown;
}

export interface AiTrustedRequestSource {
  user?: TrustedUserPrincipal | null;
  merchant?: TrustedMerchantPrincipal | null;
  headers?: Record<string, unknown>;
}

export interface AiActorContext {
  requestId: string;
  actorType: AiActorType;
  isAuthenticated: boolean;
  userId: string | null;
  merchantId: string | null;
  accountState: AiAccountState;
  kycState: AiKycState;
  merchantVerificationState: AiMerchantVerificationState;
  environmentMode: AiEnvironmentMode;
  capabilities: ReadonlyArray<AiCapability>;
}

export type AiIntent =
  | "payment_diagnosis"
  | "merchant_payment_diagnosis"
  | "wallet_summary"
  | "kyc_status"
  | "transaction_lookup"
  | "transfer_diagnosis"
  | "receipt_lookup"
  | "security_summary"
  | "merchant_overview"
  | "merchant_refund_summary"
  | "merchant_payout_summary"
  | "merchant_settlement_summary"
  | "merchant_webhook_summary"
  | "merchant_api_key_summary"
  | "merchant_analytics_summary"
  | "merchant_refund_diagnosis"
  | "merchant_payout_diagnosis"
  | "merchant_settlement_diagnosis"
  | "merchant_webhook_diagnosis"
  | "merchant_api_key_diagnosis"
  | "support_investigation"
  | "support_operations_summary"
  | "analyst_wallet_snapshot"
  | "analyst_payment_snapshot"
  | "analyst_risk_snapshot"
  | "analyst_revenue_snapshot"
  | "admin_platform_overview"
  | "admin_risk_snapshot"
  | "admin_finance_snapshot"
  | "public_product_help"
  | "secret_request"
  | "unknown";

export interface AiPageContextInput {
  route?: string;
  resourceId?: string;
}

export interface AiIntentClassification {
  intent: AiIntent;
  confidence: "high" | "medium" | "low";
  resourceId: string | null;
  needsClarification: boolean;
  reasonCode: string;
}

export type AiToolId =
  | "user.payment.timeline"
  | "user.wallet.summary"
  | "user.kyc.status"
  | "user.transaction.detail"
  | "user.receipt.detail"
  | "user.security.summary"
  | "merchant.payment.timeline"
  | "merchant.overview"
  | "merchant.refunds.summary"
  | "merchant.payouts.summary"
  | "merchant.settlements.summary"
  | "merchant.webhooks.summary"
  | "merchant.api_keys.summary"
  | "merchant.analytics.summary"
  | "merchant.refund.diagnosis"
  | "merchant.payout.diagnosis"
  | "merchant.settlement.diagnosis"
  | "merchant.webhook.diagnosis"
  | "merchant.api_key.diagnosis"
  | "support.investigate"
  | "support.operations.summary"
  | "analyst.wallet.snapshot"
  | "analyst.payment.snapshot"
  | "analyst.risk.snapshot"
  | "analyst.revenue.snapshot"
  | "admin.platform.overview"
  | "admin.risk.snapshot"
  | "admin.finance.snapshot";

export type AiPolicyReasonCode =
  | "ALLOW"
  | "FEATURE_DISABLED"
  | "AUTH_REQUIRED"
  | "ACTOR_NOT_SUPPORTED"
  | "ACCOUNT_RESTRICTED"
  | "MERCHANT_CONTEXT_REQUIRED"
  | "MERCHANT_NOT_VERIFIED"
  | "SECRET_ACCESS_FORBIDDEN"
  | "INTENT_NOT_SUPPORTED"
  | "CLARIFICATION_REQUIRED"
  | "RESOURCE_SCOPE_MISMATCH"
  | "CAPABILITY_MISSING";

export interface AiPolicyDecision {
  allow: boolean;
  reasonCode: AiPolicyReasonCode;
  allowedToolIds: ReadonlyArray<AiToolId>;
  allowedDataClasses: ReadonlyArray<AiDataClass>;
  safeMessage: string;
}

export interface AiResourceOwnerScope {
  userId?: string | null;
  merchantId?: string | null;
}

export interface AiPaymentEvent {
  code: string;
  status: string;
  at: string;
}

export type AiPaymentSubjectType =
  | "gateway_payment"
  | "wallet_transaction";

export interface AiOwnedPaymentEvidence {
  subjectType: AiPaymentSubjectType;
  paymentId: string;
  state: string;
  amountMinor: number | null;
  currency: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  failureCode: string | null;
  failureCategory: string | null;
  providerStatusCode: string | null;
  events: ReadonlyArray<AiPaymentEvent>;
}

export interface OwnedPaymentReader {
  findOwnedPaymentTimeline(input: {
    paymentId: string;
    userId: string;
  }): Promise<AiOwnedPaymentEvidence | null>;
}

export interface MerchantOwnedPaymentReader {
  findOwnedMerchantPaymentTimeline(input: {
    paymentId: string;
    merchantId: string;
  }): Promise<AiOwnedPaymentEvidence | null>;
}

export interface AiDiagnosisCause {
  code: string;
  label: string;
  evidenceRefs: ReadonlyArray<string>;
}

export interface AiPossibleDiagnosisCause extends AiDiagnosisCause {
  confidence: "high" | "medium" | "low";
}

export interface AiSuggestedAction {
  label: string;
  href?: string;
}

export type AiDiagnosisSubjectType =
  | AiPaymentSubjectType
  | "refund"
  | "payout"
  | "settlement"
  | "webhook"
  | "api";

export interface AiDiagnosis {
  subjectType: AiDiagnosisSubjectType;
  subjectId: string;
  state: string;
  exactCause?: AiDiagnosisCause;
  possibleCauses: ReadonlyArray<AiPossibleDiagnosisCause>;
  nextSteps: ReadonlyArray<AiSuggestedAction>;
  verified: boolean;
}

export type AiVerificationLevel =
  | "verified"
  | "partial"
  | "unknown";

export type AiConfidenceLevel =
  | "high"
  | "medium"
  | "low";

export interface AiSourceReference {
  type: string;
  label: string;
  reference: string;
}

export interface AiFact {
  label: string;
  value: string | number | boolean | null;
}

export interface AiToolResult {
  toolId: AiToolId;
  title: string;
  summary: string;
  verification: AiVerificationLevel;
  confidence: AiConfidenceLevel;
  facts: ReadonlyArray<AiFact>;
  sources: ReadonlyArray<AiSourceReference>;
  suggestedActions: ReadonlyArray<AiSuggestedAction>;
  diagnosis?: AiDiagnosis | null;
  data?: Record<string, unknown>;
}

export interface AiChatRequestInput {
  conversationId?: string;
  message: string;
  pageContext?: AiPageContextInput;
}

export interface AiChatResponseData {
  messageId: string;
  conversationId: string;
  content: string;
  verification: AiVerificationLevel;
  confidence: AiConfidenceLevel;
  sources: ReadonlyArray<AiSourceReference>;
  diagnosis: AiDiagnosis | null;
  suggestedActions: ReadonlyArray<AiSuggestedAction>;
  toolIds: ReadonlyArray<AiToolId>;
  facts: ReadonlyArray<AiFact>;
  data?: Record<string, unknown>;
}

export interface AiChatResult {
  success: true;
  data: AiChatResponseData;
  meta: {
    requestId: string;
    intent: AiIntent;
    role: AiActorType;
    readOnly: true;
    degraded: boolean;
    modelUsed?: boolean;
    model?: string | null;
    modelTier?: "none" | "fast" | "reasoning";
    modelProvider?: string;
    grounded?: boolean;
    knowledgeCount?: number;
    responseStyle?: "balanced" | "concise" | "detailed";
  };
}

export interface AiAuditEvent {
  eventType:
    | "request_received"
    | "policy_denied"
    | "tool_called"
    | "diagnosis_completed"
    | "knowledge_retrieved"
    | "model_called"
    | "model_fallback"
    | "response_completed"
    | "request_failed";
  requestId: string;
  actorType: AiActorType;
  actorRef: string | null;
  intent?: AiIntent;
  toolId?: AiToolId;
  reasonCode?: string;
  metadata?: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface AiAuditSink {
  write(event: AiAuditEvent): Promise<void> | void;
}

export interface AiExplanationProvider {
  readonly id: string;
  explainPayment(input: {
    diagnosis: AiDiagnosis;
    evidence: AiOwnedPaymentEvidence;
  }): Promise<string>;
}
