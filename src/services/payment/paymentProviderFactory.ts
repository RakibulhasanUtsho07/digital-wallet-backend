/* =========================================================
   PAYMENT PROVIDER CONTRACT
========================================================= */

/* =========================================================
   PROVIDERS
========================================================= */

export const PAYMENT_PROVIDER_NAMES = [
  "bkash",
  "nagad",
  "rocket",
  "upay",
  "dbbl",
  "brac",
  "city",
  "ebl",
  "bankasia",
  "prime",
  "sonali",
] as const;

export type PaymentProviderName =
  (typeof PAYMENT_PROVIDER_NAMES)[number];

/* =========================================================
   SOURCE TYPE
========================================================= */

export type PaymentSourceType =
  | "mfs"
  | "bank";

/* =========================================================
   PAYMENT STATUS
========================================================= */

export type PaymentStatus =
  | "PENDING"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED";

/* =========================================================
   INITIATE PAYMENT
========================================================= */

export interface InitiatePaymentInput {
  provider:
    PaymentProviderName;

  sourceType:
    PaymentSourceType;

  accountNumber:
    string;

  amount:
    number;

  reference?:
    string;

  /*
   * Demo only.
   *
   * Real bank/MFS integrations should authenticate
   * through the provider's secure API rather than
   * receiving a raw PIN/password here.
   */
  secretCode?:
    string;
}

export interface InitiatePaymentResult {
  providerTransactionId:
    string;

  status:
    PaymentStatus;

  verificationRequired:
    boolean;

  /*
   * Demo-only verification code.
   *
   * Never expose this in a real provider integration.
   */
  demoCode?:
    string;

  message:
    string;
}

/* =========================================================
   VERIFY PAYMENT
========================================================= */

export interface VerifyPaymentInput {
  providerTransactionId:
    string;

  verificationCode:
    string;
}

export interface VerifyPaymentResult {
  success:
    boolean;

  status:
    PaymentStatus;

  message:
    string;
}

/* =========================================================
   VALIDATE ACCOUNT
========================================================= */

export interface ValidateAccountResult {
  /*
   * Whether the provider account exists.
   */
  exists:
    boolean;

  /*
   * Whether the account is currently usable.
   */
  active:
    boolean;

  /*
   * Available balance of the source account.
   *
   * Demo mode:
   * provided from PaymentSource.
   *
   * Live mode:
   * normally returned by provider API when permitted.
   */
  availableBalance?:
    number;

  /*
   * Account holder display name.
   */
  accountName?:
    string;

  /*
   * Currency.
   */
  currency?:
    "BDT";

  /*
   * Human-readable provider response.
   */
  message?:
    string;
}

/* =========================================================
   DEBIT
========================================================= */

export interface DebitPaymentResult {
  /*
   * Whether debit authorization succeeded.
   */
  success:
    boolean;

  /*
   * Provider-side transaction reference.
   */
  providerTransactionId:
    string;

  /*
   * Human-readable result.
   */
  message:
    string;

  /*
   * Provider payment state.
   */
  status:
    | "SUCCESS"
    | "FAILED";
}

/* =========================================================
   PROVIDER INTERFACE
========================================================= */

export interface PaymentProvider {
  /*
   * Provider represented by this adapter.
   *
   * Example:
   *
   * "bkash"
   * "nagad"
   * "rocket"
   * "dbbl"
   */
  readonly provider:
    PaymentProviderName;

  /* =======================================================
     TRANSACTION ID
  ======================================================== */

  /*
   * Generate a provider-style transaction ID.
   *
   * Demo mode:
   * - generated locally.
   *
   * Live mode:
   * - this may represent a provider request/reference
   *   or be replaced by the actual gateway transaction ID.
   */
  createTransactionId():
    string;

  /* =======================================================
     INITIATE PAYMENT
  ======================================================== */

  /*
   * Starts a provider payment flow.
   *
   * Kept for future real gateway integration.
   */
  initiatePayment(
    input:
      InitiatePaymentInput
  ):
    Promise<
      InitiatePaymentResult
    >;

  /* =======================================================
     VERIFY PAYMENT
  ======================================================== */

  /*
   * Verifies a provider-side payment challenge.
   *
   * Kept for future real gateway integration.
   */
  verifyPayment(
    input:
      VerifyPaymentInput
  ):
    Promise<
      VerifyPaymentResult
    >;

  /* =======================================================
     VALIDATE ACCOUNT
  ======================================================== */

  /*
   * Checks whether the supplied account exists
   * and is active at the selected provider.
   *
   * Important:
   * paymentService.ts may perform an additional
   * authoritative database/security lookup in demo mode.
   */
  validateAccount(
    accountNumber:
      string
  ):
    Promise<
      ValidateAccountResult
    >;

  /* =======================================================
     DEBIT
  ======================================================== */

  /*
   * Authorizes a source-account debit.
   *
   * Demo mode:
   * - this method does NOT directly mutate PaymentSource.
   * - paymentService.ts performs the actual atomic
   *   source debit + wallet credit.
   *
   * Live mode:
   * - the real provider adapter should perform the
   *   provider-side debit through its API.
   */
  debit(
    accountNumber:
      string,

    amount:
      number,

    reference?:
      string
  ):
    Promise<
      DebitPaymentResult
    >;
}

/* =========================================================
   TYPE GUARDS
========================================================= */

export const isPaymentProviderName = (
  value:
    unknown
): value is PaymentProviderName => {
  return (
    typeof value ===
      "string" &&
    (
      PAYMENT_PROVIDER_NAMES as
        readonly string[]
    ).includes(
      value
    )
  );
};

/* =========================================================
   SOURCE TYPE HELPER
========================================================= */

export const getPaymentSourceType = (
  provider:
    PaymentProviderName
): PaymentSourceType => {
  switch (provider) {
    case "bkash":
    case "nagad":
    case "rocket":
    case "upay":
      return "mfs";

    case "dbbl":
    case "brac":
    case "city":
    case "ebl":
    case "bankasia":
    case "prime":
    case "sonali":
      return "bank";

    default:
      return "bank";
  }
};

/* =========================================================
   BACKWARD COMPATIBILITY
========================================================= */

/*
 * Some existing files may import ProviderName or
 * PaymentProviderAdapter from older versions.
 *
 * These aliases allow the rest of the project to migrate
 * without creating duplicate provider types.
 */

export type ProviderName =
  PaymentProviderName;

export type PaymentProviderAdapter =
  PaymentProvider;