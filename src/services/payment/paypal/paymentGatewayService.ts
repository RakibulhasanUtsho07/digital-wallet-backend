/* =========================================================
   PAYMENT GATEWAY SERVICE
========================================================= */

import {
  paypalProvider,
} from "./paypal.provider.js";

import type {
  PaymentProvider,
  PaymentProviderName,
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
} from "../../../modules/payments/contracts/paymentProvider.js";

/* =========================================================
   PROVIDER REGISTRY
========================================================= */

const providers =
  new Map<
    PaymentProviderName,
    PaymentProvider
  >([
    [
      "paypal",
      paypalProvider,
    ],
  ]);

/* =========================================================
   GET PROVIDER
========================================================= */

export const getPaymentProvider =
  (
    providerName:
      PaymentProviderName,
  ): PaymentProvider => {
    const provider =
      providers.get(
        providerName,
      );

    if (!provider) {
      throw new Error(
        `Payment provider "${providerName}" is not configured.`,
      );
    }

    return provider;
  };

/* =========================================================
   CHECK PROVIDER
========================================================= */

export const hasPaymentProvider =
  (
    providerName:
      PaymentProviderName,
  ): boolean => {
    return providers.has(
      providerName,
    );
  };

/* =========================================================
   LIST PROVIDERS
========================================================= */

export const listPaymentProviders =
  (): PaymentProviderName[] => {
    return Array.from(
      providers.keys(),
    );
  };

/* =========================================================
   CREATE
========================================================= */

export const createPayment =
  async (
    providerName:
      PaymentProviderName,

    input:
      CreatePaymentInput,
  ): Promise<CreatePaymentResult> => {
    return getPaymentProvider(
      providerName,
    ).createPayment(
      input,
    );
  };

/* =========================================================
   GET
========================================================= */

export const getPayment =
  async (
    providerName:
      PaymentProviderName,

    input:
      GetPaymentInput,
  ): Promise<GetPaymentResult> => {
    return getPaymentProvider(
      providerName,
    ).getPayment(
      input,
    );
  };

/* =========================================================
   AUTHORIZE
========================================================= */

export const authorizePayment =
  async (
    providerName:
      PaymentProviderName,

    input:
      AuthorizePaymentInput,
  ): Promise<AuthorizePaymentResult> => {
    return getPaymentProvider(
      providerName,
    ).authorizePayment(
      input,
    );
  };

/* =========================================================
   CAPTURE
========================================================= */

export const capturePayment =
  async (
    providerName:
      PaymentProviderName,

    input:
      CapturePaymentInput,
  ): Promise<CapturePaymentResult> => {
    return getPaymentProvider(
      providerName,
    ).capturePayment(
      input,
    );
  };

/* =========================================================
   REFUND
========================================================= */

export const refundPayment =
  async (
    providerName:
      PaymentProviderName,

    input:
      RefundPaymentInput,
  ): Promise<RefundPaymentResult> => {
    return getPaymentProvider(
      providerName,
    ).refundPayment(
      input,
    );
  };

/* =========================================================
   WEBHOOK
========================================================= */

export const verifyPaymentWebhook =
  async (
    providerName:
      PaymentProviderName,

    input:
      VerifyWebhookInput,
  ): Promise<VerifyWebhookResult> => {
    return getPaymentProvider(
      providerName,
    ).verifyWebhook(
      input,
    );
  };