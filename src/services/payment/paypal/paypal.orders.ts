/* =========================================================
   PAYPAL ORDERS SERVICE
   ---------------------------------------------------------
   Handles:
   - Create PayPal Order
   - Get PayPal Order
   - Authorize PayPal Order
   - Capture PayPal Order
========================================================= */

import {
  createPayPalRequestId,
  paypalRequest,
} from "./paypal.client.js";

import type {
  PayPalCreateOrderInput,
  PayPalOrderResponse,
  PayPalAmount,
  PayPalPurchaseUnit,
  PayPalOrderIntent,
} from "./paypal.types.js";

/* =========================================================
   TYPES
========================================================= */

export interface CreatePayPalOrderOptions {
  amount: string;

  currency: string;

  referenceId?: string;

  description?: string;

  returnUrl: string;

  cancelUrl: string;

  intent?: PayPalOrderIntent;

  customId?: string;

  invoiceId?: string;

  softDescriptor?: string;
}

export interface PayPalOrderResult {
  order: PayPalOrderResponse;

  approvalUrl: string | null;
}

/* =========================================================
   HELPERS
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

const normalizeAmount = (
  amount: string,
): string => {
  const value =
    amount.trim();

  if (!value) {
    throw new Error(
      "Amount is required.",
    );
  }

  const numericAmount =
    Number(value);

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
   APPROVAL URL
========================================================= */

const extractApprovalUrl = (
  order: PayPalOrderResponse,
): string | null => {
  const approveLink =
    order.links?.find(
      (link) =>
        link.rel ===
          "approve" ||
        link.rel ===
          "payer-action",
    );

  return (
    approveLink?.href ??
    null
  );
};

/* =========================================================
   CREATE PAYPAL ORDER
========================================================= */

export const createPayPalOrder =
  async (
    options: CreatePayPalOrderOptions,
  ): Promise<PayPalOrderResult> => {
    const amount =
      normalizeAmount(
        options.amount,
      );

    const currency =
      normalizeCurrency(
        options.currency,
      );

    const intent: PayPalOrderIntent =
      options.intent ??
      "CAPTURE";

    const purchaseUnit:
      PayPalPurchaseUnit = {
      amount: {
        currency_code:
          currency,

        value:
          amount,
      } satisfies PayPalAmount,

      ...(options.referenceId
        ? {
            reference_id:
              options.referenceId,
          }
        : {}),

      ...(options.description
        ? {
            description:
              options.description,
          }
        : {}),

      ...(options.customId
        ? {
            custom_id:
              options.customId,
          }
        : {}),

      ...(options.invoiceId
        ? {
            invoice_id:
              options.invoiceId,
          }
        : {}),

      ...(options.softDescriptor
        ? {
            soft_descriptor:
              options.softDescriptor,
          }
        : {}),
    };

    const body:
      PayPalCreateOrderInput = {
      intent,

      purchase_units: [
        purchaseUnit,
      ],

      application_context: {
        return_url:
          options.returnUrl,

        cancel_url:
          options.cancelUrl,

        user_action:
          "PAY_NOW",

        shipping_preference:
          "NO_SHIPPING",

        landing_page:
          "LOGIN",
      },
    };

    const response =
      await paypalRequest<PayPalOrderResponse>(
        {
          path:
            "/v2/checkout/orders",

          method:
            "POST",

          body,

          requestId:
            createPayPalRequestId(),
        },
      );

    const order =
      response.data;

    return {
      order,

      approvalUrl:
        extractApprovalUrl(
          order,
        ),
    };
  };

/* =========================================================
   GET PAYPAL ORDER
========================================================= */

export const getPayPalOrder =
  async (
    orderId: string,
  ): Promise<PayPalOrderResponse> => {
    const normalizedOrderId =
      orderId.trim();

    if (!normalizedOrderId) {
      throw new Error(
        "PayPal order ID is required.",
      );
    }

    const response =
      await paypalRequest<PayPalOrderResponse>(
        {
          path:
            `/v2/checkout/orders/${encodeURIComponent(
              normalizedOrderId,
            )}`,

          method:
            "GET",
        },
      );

    return response.data;
  };

/* =========================================================
   AUTHORIZE PAYPAL ORDER
========================================================= */

export const authorizePayPalOrder =
  async (
    orderId: string,
  ): Promise<PayPalOrderResponse> => {
    const normalizedOrderId =
      orderId.trim();

    if (!normalizedOrderId) {
      throw new Error(
        "PayPal order ID is required.",
      );
    }

    const response =
      await paypalRequest<PayPalOrderResponse>(
        {
          path:
            `/v2/checkout/orders/${encodeURIComponent(
              normalizedOrderId,
            )}/authorize`,

          method:
            "POST",

          body: {},

          requestId:
            createPayPalRequestId(),
        },
      );

    return response.data;
  };

/* =========================================================
   CAPTURE PAYPAL ORDER
========================================================= */

export const capturePayPalOrder =
  async (
    orderId: string,
  ): Promise<PayPalOrderResponse> => {
    const normalizedOrderId =
      orderId.trim();

    if (!normalizedOrderId) {
      throw new Error(
        "PayPal order ID is required.",
      );
    }

    const response =
      await paypalRequest<PayPalOrderResponse>(
        {
          path:
            `/v2/checkout/orders/${encodeURIComponent(
              normalizedOrderId,
            )}/capture`,

          method:
            "POST",

          body: {},

          requestId:
            createPayPalRequestId(),
        },
      );

    return response.data;
  };