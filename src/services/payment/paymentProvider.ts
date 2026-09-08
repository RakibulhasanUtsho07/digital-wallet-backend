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
  provider: PaymentProviderName;

  sourceType: PaymentSourceType;

  accountNumber: string;

  amount: number;

  reference?: string;

  /*
   * Demo only.
   *
   * Real provider integrations should authenticate
   * through provider APIs instead of receiving a
   * user's real PIN/password.
   */
  secretCode?: string;
}

export interface InitiatePaymentResult {
  providerTransactionId: string;

  status: PaymentStatus;

  verificationRequired: boolean;

  /*
   * Demo-only value.
   *
   * Never expose this in a real provider integration.
   */
  demoCode?: string;

  message: string;
}

/* =========================================================
   VERIFY PAYMENT
========================================================= */

export interface VerifyPaymentInput {
  providerTransactionId: string;

  verificationCode: string;
}

export interface VerifyPaymentResult {
  success: boolean;

  status: PaymentStatus;

  message: string;
}

/* =========================================================
   ACCOUNT VALIDATION
========================================================= */

export interface ValidateAccountResult {
  exists: boolean;

  active: boolean;

  availableBalance?: number;

  accountName?: string;

  currency?: "BDT";

  message?: string;
}

/* =========================================================
   DEBIT
========================================================= */

export interface DebitPaymentResult {
  success: boolean;

  providerTransactionId: string;

  message: string;

  status: "SUCCESS" | "FAILED";
}

/* =========================================================
   PAYMENT PROVIDER ADAPTER
========================================================= */

export interface PaymentProvider {
  /*
   * Provider represented by this adapter.
   */
  readonly provider: PaymentProviderName;

  /*
   * Generate provider-style transaction ID.
   *
   * Demo:
   *   locally generated
   *
   * Live:
   *   may be replaced by actual provider reference.
   */
  createTransactionId(): string;

  /*
   * Initialize payment.
   */
  initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentResult>;

  /*
   * Verify payment.
   */
  verifyPayment(
    input: VerifyPaymentInput
  ): Promise<VerifyPaymentResult>;

  /*
   * Validate source account.
   */
  validateAccount(
    accountNumber: string
  ): Promise<ValidateAccountResult>;

  /*
   * Authorize/debit source account.
   *
   * IMPORTANT:
   * Demo implementation does NOT mutate the database.
   *
   * paymentService.ts owns the atomic DB ledger operation.
   */
  debit(
    accountNumber: string,
    amount: number,
    reference?: string
  ): Promise<DebitPaymentResult>;
}

/*
 * Backward compatible alias.
 */
export type PaymentProviderAdapter =
  PaymentProvider;

/* =========================================================
   TYPE GUARD
========================================================= */

export const isPaymentProviderName = (
  value: unknown
): value is PaymentProviderName => {
  return (
    typeof value === "string" &&
    (
      PAYMENT_PROVIDER_NAMES as readonly string[]
    ).includes(value)
  );
};

/* =========================================================
   SOURCE TYPE HELPER
========================================================= */

export const getPaymentSourceType = (
  provider: PaymentProviderName
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