/* =========================================================
   COMMON PAYMENT PROVIDER CONTRACT
========================================================= */

export type PaymentProviderName =
  | "paypal"
  | "card"
  | "local_psp";

export type PaymentEnvironment =
  | "test"
  | "live";

export type PaymentProviderStatus =
  | "CREATED"
  | "PENDING"
  | "AUTHORIZED"
  | "CAPTURED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "DISPUTED";

export type PaymentIntent =
  | "CAPTURE"
  | "AUTHORIZE";

/* =========================================================
   MONEY
========================================================= */

export interface Money {
  amount: string;
  currency: string;
}

/* =========================================================
   CREATE
========================================================= */

export interface CreatePaymentInput {
  paymentId: string;
  merchantId: string;

  amount: string;
  currency: string;

  merchantReference?: string;
  description?: string;

  customerId?: string;
  orderId?: string;

  returnUrl: string;
  cancelUrl: string;

  environment: PaymentEnvironment;

  metadata?: Record<
    string,
    unknown
  >;
}

export interface CreatePaymentResult {
  provider: PaymentProviderName;

  providerPaymentId: string;

  status: PaymentProviderStatus;

  amount: Money;

  approvalUrl?: string;

  checkoutUrl?: string;

  raw: unknown;
}

/* =========================================================
   GET
========================================================= */

export interface GetPaymentInput {
  providerPaymentId: string;

  environment: PaymentEnvironment;
}

export interface GetPaymentResult {
  provider: PaymentProviderName;

  providerPaymentId: string;

  status: PaymentProviderStatus;

  amount?: Money;

  raw: unknown;
}

/* =========================================================
   AUTHORIZE
========================================================= */

export interface AuthorizePaymentInput {
  providerPaymentId: string;

  environment: PaymentEnvironment;

  metadata?: Record<
    string,
    unknown
  >;
}

export interface AuthorizePaymentResult {
  provider: PaymentProviderName;

  providerPaymentId: string;

  status: PaymentProviderStatus;

  raw: unknown;
}

/* =========================================================
   CAPTURE
========================================================= */

export interface CapturePaymentInput {
  providerPaymentId: string;

  environment: PaymentEnvironment;

  metadata?: Record<
    string,
    unknown
  >;
}

export interface CapturePaymentResult {
  provider: PaymentProviderName;

  providerPaymentId: string;

  status: PaymentProviderStatus;

  amount?: Money;

  providerTransactionId?: string;

  raw: unknown;
}

/* =========================================================
   REFUND
========================================================= */

export interface RefundPaymentInput {
  providerPaymentId: string;

  environment: PaymentEnvironment;

  amount?: string;

  currency?: string;

  reason?: string;

  metadata?: Record<
    string,
    unknown
  >;
}

export interface RefundPaymentResult {
  provider: PaymentProviderName;

  providerPaymentId: string;

  providerRefundId: string;

  status:
    | "PENDING"
    | "COMPLETED"
    | "FAILED";

  amount?: Money;

  raw: unknown;
}

/* =========================================================
   WEBHOOK
========================================================= */

export interface VerifyWebhookInput {
  headers: Record<
    string,
    string | string[] | undefined
  >;

  body: string | Buffer;

  environment: PaymentEnvironment;
}

export interface VerifyWebhookResult {
  verified: boolean;

  eventId?: string;

  eventType?: string;

  raw?: unknown;
}

/* =========================================================
   PROVIDER
========================================================= */

export interface PaymentProvider {
  readonly name: PaymentProviderName;

  createPayment(
    input: CreatePaymentInput,
  ): Promise<CreatePaymentResult>;

  getPayment(
    input: GetPaymentInput,
  ): Promise<GetPaymentResult>;

  authorizePayment(
    input: AuthorizePaymentInput,
  ): Promise<AuthorizePaymentResult>;

  capturePayment(
    input: CapturePaymentInput,
  ): Promise<CapturePaymentResult>;

  refundPayment(
    input: RefundPaymentInput,
  ): Promise<RefundPaymentResult>;

  verifyWebhook(
    input: VerifyWebhookInput,
  ): Promise<VerifyWebhookResult>;
}