/* =========================================================
   PAYPAL PROVIDER
   ---------------------------------------------------------
   Adapts PayPal payment services to the common
   PaymentProvider contract.

   Responsibilities:
   - Create payment
   - Get payment
   - Authorize payment
   - Capture payment
   - Refund (not implemented yet)
   - Webhook verification (not implemented yet)
========================================================= */

import {
  createPayPalPayment,
  getPayPalPayment,
  authorizePayPalPayment,
  capturePayPalPayment,
} from "./paypal.payments.js";

import type {
  PaymentProvider,
  CreatePaymentInput,
  CreatePaymentResult,
  GetPaymentInput,
  GetPaymentResult,
  AuthorizePaymentInput,
  AuthorizePaymentResult,
  CapturePaymentInput,
  CapturePaymentResult,
  RefundPaymentInput,
  RefundPaymentResult,
  VerifyWebhookInput,
  VerifyWebhookResult,
  PaymentProviderStatus,
} from "../../../modules/payments/contracts/paymentProvider.js";

/* =========================================================
   HELPERS
========================================================= */

const mapStatus = (
  status: string,
): PaymentProviderStatus => {
  switch (
    status.toUpperCase()
  ) {
    case "CREATED":
      return "CREATED";

    case "PENDING":
      return "PENDING";

    case "AUTHORIZED":
      return "AUTHORIZED";

    case "CAPTURED":
      return "CAPTURED";

    case "COMPLETED":
      return "COMPLETED";

    case "FAILED":
      return "FAILED";

    case "CANCELLED":
      return "CANCELLED";

    case "EXPIRED":
      return "EXPIRED";

    case "REFUNDED":
      return "REFUNDED";

    case "PARTIALLY_REFUNDED":
      return "PARTIALLY_REFUNDED";

    case "DISPUTED":
      return "DISPUTED";

    default:
      return "PENDING";
  }
};

/* =========================================================
   PAYPAL PROVIDER
========================================================= */

export class PayPalProvider
  implements PaymentProvider
{
  readonly name =
    "paypal" as const;

  /* =======================================================
     CREATE PAYMENT
  ======================================================== */

  async createPayment(
    input: CreatePaymentInput,
  ): Promise<CreatePaymentResult> {
    const result =
      await createPayPalPayment({
        amount:
          input.amount,

        currency:
          input.currency,

        returnUrl:
          input.returnUrl,

        cancelUrl:
          input.cancelUrl,

        referenceId:
          input.merchantReference,

        description:
          input.description,

        customId:
          input.paymentId,

        intent:
          "CAPTURE",
      });

    return {
      provider:
        "paypal",

      providerPaymentId:
        result.providerPaymentId,

      status:
        mapStatus(
          result.status,
        ),

      amount: {
        amount:
          result.amount,

        currency:
          result.currency,
      },

      approvalUrl:
        result.approvalUrl ??
        undefined,

      checkoutUrl:
        result.approvalUrl ??
        undefined,

      raw:
        result.order,
    };
  }

  /* =======================================================
     GET PAYMENT
  ======================================================== */

  async getPayment(
    input: GetPaymentInput,
  ): Promise<GetPaymentResult> {
    const result =
      await getPayPalPayment(
        input.providerPaymentId,
      );

    return {
      provider:
        "paypal",

      providerPaymentId:
        result.providerPaymentId,

      status:
        mapStatus(
          result.status,
        ),

      ...(result.amount &&
      result.currency
        ? {
            amount: {
              amount:
                result.amount,

              currency:
                result.currency,
            },
          }
        : {}),

      raw:
        result.order,
    };
  }

  /* =======================================================
     AUTHORIZE PAYMENT
  ======================================================== */

  async authorizePayment(
    input: AuthorizePaymentInput,
  ): Promise<AuthorizePaymentResult> {
    const result =
      await authorizePayPalPayment(
        input.providerPaymentId,
      );

    return {
      provider:
        "paypal",

      providerPaymentId:
        result.providerPaymentId,

      status:
        mapStatus(
          result.status,
        ),

      raw:
        result.order,
    };
  }

  /* =======================================================
     CAPTURE PAYMENT
  ======================================================== */

  async capturePayment(
    input: CapturePaymentInput,
  ): Promise<CapturePaymentResult> {
    const result =
      await capturePayPalPayment(
        input.providerPaymentId,
      );

    return {
      provider:
        "paypal",

      providerPaymentId:
        result.providerPaymentId,

      status:
        mapStatus(
          result.status,
        ),

      ...(result.amount &&
      result.currency
        ? {
            amount: {
              amount:
                result.amount,

              currency:
                result.currency,
            },
          }
        : {}),

      providerTransactionId:
        result.providerTransactionId,

      raw:
        result.order,
    };
  }

  /* =======================================================
     REFUND PAYMENT
  ======================================================== */

  async refundPayment(
    _input: RefundPaymentInput,
  ): Promise<RefundPaymentResult> {
    throw new Error(
      "PayPal refund integration is not implemented yet.",
    );
  }

  /* =======================================================
     VERIFY WEBHOOK
  ======================================================== */

  async verifyWebhook(
    _input: VerifyWebhookInput,
  ): Promise<VerifyWebhookResult> {
    throw new Error(
      "PayPal webhook verification is not implemented yet.",
    );
  }
}

/* =========================================================
   SINGLETON
========================================================= */

export const paypalProvider =
  new PayPalProvider();