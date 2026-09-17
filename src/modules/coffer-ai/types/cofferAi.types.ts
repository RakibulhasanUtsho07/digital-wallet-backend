export type AiActorType =
  | "guest"
  | "user"
  | "merchant"
  | "admin";

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
  | "merchant:profile:read:self"
  | "merchant:payment:read:self"
  | "merchant:webhook:read:self"
  | "merchant:payout:read:self";

export type AiDataClass =
  | "public"
  | "account_private"
  | "merchant_private"
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

/**
 * Only properties attached by trusted server middleware belong here.
 * Request body/query data must never be copied into this object.
 */
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
  | "merchant.payment.timeline";

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
  /**
   * Production implementation MUST query by paymentId AND authenticated userId.
   * Never load by paymentId first and check ownership later.
   */
  findOwnedPaymentTimeline(input: {
    paymentId: string;
    userId: string;
  }): Promise<AiOwnedPaymentEvidence | null>;
}

export interface MerchantOwnedPaymentReader {
  /**
   * Production implementation MUST query by paymentId AND the trusted
   * merchantId in the same database query. Client payload ownership fields
   * must never be used.
   */
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

export interface AiDiagnosis {
  subjectType: AiPaymentSubjectType;
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
  type:
    | "payment_timeline"
    | "merchant_payment_timeline"
    | "wallet_transaction_timeline"
    | "system_policy";
  label: string;
  reference: string;
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
}

export interface AiChatResult {
  success: true;
  data: AiChatResponseData;
  meta: {
    requestId: string;
    intent: AiIntent;
    degraded: boolean;
  };
}

export interface AiAuditEvent {
  eventType:
    | "request_received"
    | "policy_denied"
    | "tool_called"
    | "diagnosis_completed"
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
