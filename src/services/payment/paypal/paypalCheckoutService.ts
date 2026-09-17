/* =========================================================
   PAYPAL CHECKOUT SERVICE
   ---------------------------------------------------------
   Responsibilities:
   - Create internal Payment
   - Create PaymentAttempt
   - Call PayPal through Payment Gateway
   - Store PayPal Order ID
   - Store ProviderTransaction
   - Handle idempotency
   - Mark payment failed when provider call fails

   IMPORTANT:
   This service does NOT modify the existing legacy
   paymentService.ts.
========================================================= */

import crypto from "node:crypto";

import {
  Payment,
} from "../../../models/Payment.js";

import {
  PaymentAttempt,
} from "../../../models/PaymentAttempt.js";

import {
  ProviderTransaction,
} from "../../../models/ProviderTransaction.js";

import {
  createPayment,
} from "./paymentGatewayService.js";

/* =========================================================
   TYPES
========================================================= */

export type PayPalCheckoutEnvironment =
  | "test"
  | "live";

export interface CreatePayPalCheckoutInput {
  merchantId: string;

  customerId?: string;

  orderId?: string;

  amount: string;

  currency: string;

  merchantReference?: string;

  description?: string;

  returnUrl: string;

  cancelUrl: string;

  idempotencyKey: string;

  environment?: PayPalCheckoutEnvironment;

  metadata?: Record<
    string,
    unknown
  >;
}

export interface PayPalCheckoutResult {
  paymentId: string;

  provider: "paypal";

  providerPaymentId: string;

  status: string;

  approvalUrl: string | null;

  checkoutUrl: string | null;

  amount: string;

  currency: string;

  idempotencyKey: string;
}

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_ENVIRONMENT:
  PayPalCheckoutEnvironment =
  "test";

/*
 * This value is supported by the current
 * PaymentAttempt failureCode type.
 */
const PAYPAL_ATTEMPT_FAILURE_CODE =
  "provider_error" as const;

/* =========================================================
   ID GENERATORS
========================================================= */

const generatePaymentId =
  (): string => {
    return `pay_${Date.now()}_${crypto
      .randomBytes(8)
      .toString("hex")}`;
  };

const generateAttemptId =
  (): string => {
    return `attempt_${Date.now()}_${crypto
      .randomBytes(8)
      .toString("hex")}`;
  };

const generateProviderTransactionId =
  (): string => {
    return `provider_tx_${Date.now()}_${crypto
      .randomBytes(8)
      .toString("hex")}`;
  };

/* =========================================================
   AMOUNT NORMALIZER
========================================================= */

const normalizeAmount = (
  amount: string,
): string => {
  const normalized =
    amount.trim();

  if (!normalized) {
    throw new Error(
      "Payment amount is required.",
    );
  }

  const numericAmount =
    Number(normalized);

  if (
    !Number.isFinite(
      numericAmount,
    )
  ) {
    throw new Error(
      "Invalid payment amount.",
    );
  }

  if (
    numericAmount <= 0
  ) {
    throw new Error(
      "Payment amount must be greater than zero.",
    );
  }

  return numericAmount.toFixed(2);
};

/* =========================================================
   CURRENCY NORMALIZER
========================================================= */

const normalizeCurrency = (
  currency: string,
): string => {
  const normalized =
    currency
      .trim()
      .toUpperCase();

  if (!normalized) {
    throw new Error(
      "Currency is required.",
    );
  }

  return normalized;
};

/* =========================================================
   IDEMPOTENCY KEY NORMALIZER
========================================================= */

const normalizeIdempotencyKey =
  (
    idempotencyKey: string,
  ): string => {
    const normalized =
      idempotencyKey.trim();

    if (!normalized) {
      throw new Error(
        "Idempotency key is required.",
      );
    }

    if (
      normalized.length > 255
    ) {
      throw new Error(
        "Idempotency key must not exceed 255 characters.",
      );
    }

    return normalized;
  };

/* =========================================================
   URL NORMALIZER
========================================================= */

const normalizeUrl = (
  value: string,
  fieldName: string,
): string => {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `${fieldName} is required.`,
    );
  }

  try {
    new URL(
      normalized,
    );
  } catch {
    throw new Error(
      `${fieldName} must be a valid URL.`,
    );
  }

  return normalized;
};

/* =========================================================
   DUPLICATE KEY CHECK
========================================================= */

const isDuplicateKeyError = (
  error: unknown,
): boolean => {
  if (
    !error ||
    typeof error !==
      "object"
  ) {
    return false;
  }

  const object =
    error as {
      code?: unknown;
    };

  return (
    object.code === 11000
  );
};

/* =========================================================
   FIND EXISTING PAYMENT
========================================================= */

const findExistingPayment =
  async (
    merchantId: string,
    mode:
      | "test"
      | "live",
    idempotencyKey: string,
  ) => {
    return Payment.findOne({
      merchantId,

      mode,

      idempotencyKey,
    });
  };

/* =========================================================
   BUILD EXISTING PAYMENT RESULT
========================================================= */

const buildExistingPaymentResult =
  (
    payment: {
      paymentId: string;

      providerPaymentId?:
        string;

      status: string;

      checkoutUrl?:
        string | null;

      amount: unknown;

      currency: string;

      idempotencyKey?:
        string;
    },

    fallbackIdempotencyKey:
      string,
  ): PayPalCheckoutResult => {
    if (
      !payment.providerPaymentId
    ) {
      throw new Error(
        "Existing payment does not have a PayPal provider payment ID.",
      );
    }

    return {
      paymentId:
        payment.paymentId,

      provider:
        "paypal",

      providerPaymentId:
        payment.providerPaymentId,

      status:
        payment.status,

      approvalUrl:
        payment.checkoutUrl ??
        null,

      checkoutUrl:
        payment.checkoutUrl ??
        null,

      amount:
        String(
          payment.amount,
        ),

      currency:
        payment.currency,

      idempotencyKey:
        payment.idempotencyKey ??
        fallbackIdempotencyKey,
    };
  };

/* =========================================================
   CREATE INTERNAL PAYMENT
   ---------------------------------------------------------
   Kept separate so TypeScript can correctly infer the
   hydrated Mongoose document type.
========================================================= */

const createInternalPayment =
  async (
    input: {
      paymentId: string;

      merchantId: string;

      customerId?: string;

      orderId?: string;

      amount: string;

      currency: string;

      merchantReference?:
        string;

      idempotencyKey:
        string;

      returnUrl: string;

      cancelUrl: string;

      mode:
        | "test"
        | "live";
    },
  ) => {
    try {
      return await Payment.create({
        paymentId:
          input.paymentId,

        merchantId:
          input.merchantId,

        ...(input.customerId
          ? {
              customerId:
                input.customerId,
            }
          : {}),

        ...(input.orderId
          ? {
              orderId:
                input.orderId,
            }
          : {}),

        amount:
          input.amount,

        currency:
          input.currency,

        feeAmount:
          "0",

        netAmount:
          input.amount,

        sourceType:
          "paypal",

        provider:
          "paypal",

        mode:
          input.mode,

        status:
          "pending",

        ...(input.merchantReference
          ? {
              merchantReference:
                input.merchantReference,
            }
          : {}),

        idempotencyKey:
          input.idempotencyKey,

        returnUrl:
          input.returnUrl,

        cancelUrl:
          input.cancelUrl,
      });
    } catch (
      error: unknown
    ) {
      /* ===================================================
         DUPLICATE REQUEST RACE
      ==================================================== */

      if (
        isDuplicateKeyError(
          error,
        )
      ) {
        const racedPayment =
          await findExistingPayment(
            input.merchantId,
            input.mode,
            input.idempotencyKey,
          );

        if (
          racedPayment
        ) {
          return racedPayment;
        }
      }

      throw error;
    }
  };

/* =========================================================
   CREATE PAYPAL CHECKOUT
========================================================= */

export const createPayPalCheckout =
  async (
    input: CreatePayPalCheckoutInput,
  ): Promise<PayPalCheckoutResult> => {
    /* =====================================================
       VALIDATE MERCHANT
    ====================================================== */

    const merchantId =
      input.merchantId.trim();

    if (!merchantId) {
      throw new Error(
        "Merchant ID is required.",
      );
    }

    /* =====================================================
       NORMALIZE PAYMENT DATA
    ====================================================== */

    const amount =
      normalizeAmount(
        input.amount,
      );

    const currency =
      normalizeCurrency(
        input.currency,
      );

    const idempotencyKey =
      normalizeIdempotencyKey(
        input.idempotencyKey,
      );

    const returnUrl =
      normalizeUrl(
        input.returnUrl,
        "Return URL",
      );

    const cancelUrl =
      normalizeUrl(
        input.cancelUrl,
        "Cancel URL",
      );

    const environment =
      input.environment ??
      DEFAULT_ENVIRONMENT;

    const mode =
      environment === "live"
        ? "live"
        : "test";

    /* =====================================================
       IDEMPOTENCY CHECK
    ====================================================== */

    const existingPayment =
      await findExistingPayment(
        merchantId,
        mode,
        idempotencyKey,
      );

    if (
      existingPayment
    ) {
      return buildExistingPaymentResult(
        existingPayment,
        idempotencyKey,
      );
    }

    /* =====================================================
       INTERNAL PAYMENT ID
    ====================================================== */

    const paymentId =
      generatePaymentId();

    /* =====================================================
       CREATE INTERNAL PAYMENT
    ====================================================== */

    const payment =
      await createInternalPayment(
        {
          paymentId,

          merchantId,

          customerId:
            input.customerId,

          orderId:
            input.orderId,

          amount,

          currency,

          merchantReference:
            input.merchantReference,

          idempotencyKey,

          returnUrl,

          cancelUrl,

          mode,
        },
      );

    /* =====================================================
       RACE CONDITION RESULT
       -----------------------------------------------------
       If another request created the same payment while
       this request was processing, return it instead of
       continuing to create another PayPal order.
    ====================================================== */

    if (
      payment.providerPaymentId
    ) {
      return buildExistingPaymentResult(
        payment,
        idempotencyKey,
      );
    }

    /* =====================================================
       CREATE PAYMENT ATTEMPT
    ====================================================== */

    const attemptId =
      generateAttemptId();

    const attempt =
      await PaymentAttempt.create({
        attemptId,

        paymentId:
          payment._id,

        merchantId,

        provider:
          "paypal",

        operation:
          "create",

        status:
          "processing",

        attemptNumber:
          1,
      });

    /* =====================================================
       CALL PAYPAL
    ====================================================== */

    try {
      const providerResult =
        await createPayment(
          "paypal",
          {
            paymentId,

            merchantId,

            amount,

            currency,

            merchantReference:
              input.merchantReference,

            description:
              input.description,

            customerId:
              input.customerId,

            orderId:
              input.orderId,

            returnUrl,

            cancelUrl,

            environment,

            metadata:
              input.metadata,
          },
        );

      /* ===================================================
         UPDATE PAYMENT
      ==================================================== */

      payment.providerPaymentId =
        providerResult.providerPaymentId;

      /*
       * Payment.checkoutUrl is optional string in the
       * current model, so do not assign null.
       */
      payment.checkoutUrl =
        providerResult.checkoutUrl ??
        providerResult.approvalUrl ??
        undefined;

      payment.status =
        "pending";

      await payment.save();

      /* ===================================================
         UPDATE PAYMENT ATTEMPT
      ==================================================== */

      attempt.status =
        "created";

      attempt.providerRequestId =
        providerResult.providerPaymentId;

      attempt.providerResponseId =
        providerResult.providerPaymentId;

      await attempt.save();

      /* ===================================================
         CREATE PROVIDER TRANSACTION
      ==================================================== */

      await ProviderTransaction.create({
        providerTransactionId:
          generateProviderTransactionId(),

        paymentId:
          payment._id,

        merchantId,

        provider:
          "paypal",

        mode,

        externalTransactionId:
          providerResult.providerPaymentId,

        transactionType:
          "payment",

        status:
          "pending",

        amount,

        currency,

        providerEventType:
          "CHECKOUT.ORDER.CREATED",

        metadata: {
          providerStatus:
            providerResult.status,

          paypalOrderId:
            providerResult.providerPaymentId,
        },
      });

      /* ===================================================
         RETURN CHECKOUT INFORMATION
      ==================================================== */

      return {
        paymentId:
          payment.paymentId,

        provider:
          "paypal",

        providerPaymentId:
          providerResult.providerPaymentId,

        status:
          payment.status,

        approvalUrl:
          providerResult.approvalUrl ??
          null,

        checkoutUrl:
          providerResult.checkoutUrl ??
          providerResult.approvalUrl ??
          null,

        amount:
          providerResult.amount.amount,

        currency:
          providerResult.amount.currency,

        idempotencyKey,
      };
    } catch (
      error: unknown
    ) {
      /* ===================================================
         MARK PAYMENT FAILED
      ==================================================== */

      payment.status =
        "failed";

      /*
       * We intentionally do not set payment.failureCode
       * here because the current Payment model has its own
       * restricted PaymentFailureCode union.
       *
       * failureMessage is enough for this provider-level
       * failure at this stage.
       */

      payment.failureMessage =
        error instanceof Error
          ? error.message
          : "PayPal payment creation failed.";

      await payment.save();

      /* ===================================================
         MARK ATTEMPT FAILED
      ==================================================== */

      attempt.status =
        "failed";

      attempt.failureCode =
        PAYPAL_ATTEMPT_FAILURE_CODE;

      attempt.failureMessage =
        error instanceof Error
          ? error.message
          : "PayPal payment creation failed.";

      await attempt.save();

      throw error;
    }
  };

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  createPayPalCheckout,
};