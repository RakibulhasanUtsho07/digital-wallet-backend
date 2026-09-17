/* =========================================================
   PAYPAL PAYMENTS SERVICE
   ---------------------------------------------------------
   Responsibilities:
   - Create PayPal payment/order
   - Get PayPal payment/order
   - Authorize PayPal payment
   - Capture PayPal payment
   - Normalize PayPal response
========================================================= */

import {
  createPayPalOrder,
  getPayPalOrder,
  authorizePayPalOrder,
  capturePayPalOrder,
} from "./paypal.orders.js";

import type {
  PayPalOrderResponse,
  PayPalOrderIntent,
} from "./paypal.types.js";

/* =========================================================
   TYPES
========================================================= */

export type PayPalPaymentStatus =
  | "CREATED"
  | "PENDING"
  | "AUTHORIZED"
  | "CAPTURED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED"
  | "UNKNOWN";

/* =========================================================
   CREATE PAYMENT INPUT
========================================================= */

export interface CreatePayPalPaymentInput {
  amount: string;

  currency: string;

  returnUrl: string;

  cancelUrl: string;

  referenceId?: string;

  description?: string;

  customId?: string;

  invoiceId?: string;

  softDescriptor?: string;

  intent?: PayPalOrderIntent;
}

/* =========================================================
   CREATE PAYMENT RESULT
========================================================= */

export interface CreatePayPalPaymentResult {
  providerPaymentId: string;

  status: PayPalPaymentStatus;

  approvalUrl: string | null;

  amount: string;

  currency: string;

  intent: PayPalOrderIntent;

  order: PayPalOrderResponse;
}

/* =========================================================
   NORMALIZED PAYMENT RESULT
========================================================= */

export interface PayPalPaymentResult {
  providerPaymentId: string;

  status: PayPalPaymentStatus;

  amount?: string;

  currency?: string;

  providerTransactionId?: string;

  order: PayPalOrderResponse;
}

/* =========================================================
   STATUS MAPPER
========================================================= */

const mapPayPalStatus = (
  status: string | undefined,
): PayPalPaymentStatus => {
  switch (
    status?.toUpperCase()
  ) {
    case "CREATED":
      return "CREATED";

    case "SAVED":
      return "CREATED";

    case "APPROVED":
      return "PENDING";

    case "PAYER_ACTION_REQUIRED":
      return "PENDING";

    case "VOIDED":
      return "CANCELLED";

    case "COMPLETED":
      return "COMPLETED";

    default:
      return "UNKNOWN";
  }
};

/* =========================================================
   EXTRACT AMOUNT
========================================================= */

const extractOrderAmount = (
  order: PayPalOrderResponse,
): {
  amount?: string;
  currency?: string;
} => {
  const purchaseUnit =
    order.purchase_units?.[0];

  const amount =
    purchaseUnit?.amount;

  if (!amount) {
    return {};
  }

  return {
    amount: amount.value,

    currency:
      amount.currency_code,
  };
};

/* =========================================================
   EXTRACT CAPTURE ID
========================================================= */

const extractCaptureId = (
  order: PayPalOrderResponse,
): string | undefined => {
  const captures =
    order.purchase_units?.[0]
      ?.payments?.captures;

  if (
    !captures ||
    captures.length === 0
  ) {
    return undefined;
  }

  return captures[0]?.id;
};

/* =========================================================
   EXTRACT AUTHORIZATION ID
========================================================= */

const extractAuthorizationId = (
  order: PayPalOrderResponse,
): string | undefined => {
  const authorizations =
    order.purchase_units?.[0]
      ?.payments?.authorizations;

  if (
    !authorizations ||
    authorizations.length === 0
  ) {
    return undefined;
  }

  return authorizations[0]?.id;
};

/* =========================================================
   CREATE PAYPAL PAYMENT
========================================================= */

export const createPayPalPayment =
  async (
    input: CreatePayPalPaymentInput,
  ): Promise<CreatePayPalPaymentResult> => {
    const result =
      await createPayPalOrder({
        amount:
          input.amount,

        currency:
          input.currency,

        returnUrl:
          input.returnUrl,

        cancelUrl:
          input.cancelUrl,

        referenceId:
          input.referenceId,

        description:
          input.description,

        customId:
          input.customId,

        invoiceId:
          input.invoiceId,

        softDescriptor:
          input.softDescriptor,

        intent:
          input.intent ??
          "CAPTURE",
      });

    const amount =
      extractOrderAmount(
        result.order,
      );

    return {
      providerPaymentId:
        result.order.id,

      status:
        mapPayPalStatus(
          result.order.status,
        ),

      approvalUrl:
        result.approvalUrl,

      amount:
        amount.amount ??
        input.amount,

      currency:
        amount.currency ??
        input.currency
          .trim()
          .toUpperCase(),

      intent:
        result.order.intent ??
        input.intent ??
        "CAPTURE",

      order:
        result.order,
    };
  };

/* =========================================================
   GET PAYPAL PAYMENT
========================================================= */

export const getPayPalPayment =
  async (
    providerPaymentId: string,
  ): Promise<PayPalPaymentResult> => {
    const order =
      await getPayPalOrder(
        providerPaymentId,
      );

    const amount =
      extractOrderAmount(
        order,
      );

    const captureId =
      extractCaptureId(
        order,
      );

    const authorizationId =
      extractAuthorizationId(
        order,
      );

    return {
      providerPaymentId:
        order.id,

      status:
        mapPayPalStatus(
          order.status,
        ),

      amount:
        amount.amount,

      currency:
        amount.currency,

      providerTransactionId:
        captureId ??
        authorizationId,

      order,
    };
  };

/* =========================================================
   AUTHORIZE PAYPAL PAYMENT
========================================================= */

export const authorizePayPalPayment =
  async (
    providerPaymentId: string,
  ): Promise<PayPalPaymentResult> => {
    const order =
      await authorizePayPalOrder(
        providerPaymentId,
      );

    const amount =
      extractOrderAmount(
        order,
      );

    const authorizationId =
      extractAuthorizationId(
        order,
      );

    return {
      providerPaymentId:
        order.id,

      status:
        mapPayPalStatus(
          order.status,
        ) === "UNKNOWN"
          ? "AUTHORIZED"
          : mapPayPalStatus(
              order.status,
            ),

      amount:
        amount.amount,

      currency:
        amount.currency,

      providerTransactionId:
        authorizationId,

      order,
    };
  };

/* =========================================================
   CAPTURE PAYPAL PAYMENT
========================================================= */

export const capturePayPalPayment =
  async (
    providerPaymentId: string,
  ): Promise<PayPalPaymentResult> => {
    const order =
      await capturePayPalOrder(
        providerPaymentId,
      );

    const amount =
      extractOrderAmount(
        order,
      );

    const captureId =
      extractCaptureId(
        order,
      );

    const captureStatus =
      order.purchase_units?.[0]
        ?.payments
        ?.captures?.[0]
        ?.status;

    return {
      providerPaymentId:
        order.id,

      status:
        captureStatus?.toUpperCase() ===
        "COMPLETED"
          ? "COMPLETED"
          : mapPayPalStatus(
              order.status,
            ) === "UNKNOWN"
            ? "CAPTURED"
            : mapPayPalStatus(
                order.status,
              ),

      amount:
        amount.amount,

      currency:
        amount.currency,

      providerTransactionId:
        captureId,

      order,
    };
  };