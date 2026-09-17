/* =========================================================
   PAYPAL CANCEL CONTROLLER
   ---------------------------------------------------------
   Responsibilities:
   - Receive PayPal cancel redirect
   - Read PayPal order ID
   - Find internal payment
   - Mark payment as cancelled
   - Update latest PayPal provider transaction
   - Return cancellation response
========================================================= */

import type {
  Request,
  Response,
  NextFunction,
} from "express";

import {
  Payment,
} from "../models/Payment.js";

import {
  ProviderTransaction,
} from "../models/ProviderTransaction.js";

/* =========================================================
   HELPERS
========================================================= */

const getStringValue = (
  value: unknown,
): string | null => {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const normalized =
    value.trim();

  return normalized.length > 0
    ? normalized
    : null;
};

const generateProviderTransactionId =
  (): string => {
    return `provider_tx_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 12)}`;
  };

/* =========================================================
   CANCEL PAYPAL PAYMENT
========================================================= */

export const cancelPayPalPayment =
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      /* ===================================================
         PAYPAL ORDER TOKEN
      ==================================================== */

      const token =
        getStringValue(
          req.query.token,
        );

      if (!token) {
        res.status(400).json({
          success: false,

          message:
            "PayPal order token is required.",
        });

        return;
      }

      /* ===================================================
         FIND PAYMENT
      ==================================================== */

      const payment =
        await Payment.findOne({
          provider:
            "paypal",

          providerPaymentId:
            token,
        });

      if (!payment) {
        res.status(404).json({
          success: false,

          message:
            "Payment associated with this PayPal order could not be found.",
        });

        return;
      }

      /* ===================================================
         ALREADY COMPLETED
      ==================================================== */

      if (
        payment.status ===
        "completed"
      ) {
        res.status(409).json({
          success: false,

          message:
            "A completed payment cannot be cancelled.",
        });

        return;
      }

      /* ===================================================
         ALREADY CANCELLED
      ==================================================== */

      if (
        payment.status ===
        "cancelled"
      ) {
        res.status(200).json({
          success: true,

          message:
            "Payment has already been cancelled.",

          data: {
            paymentId:
              payment.paymentId,

            provider:
              "paypal",

            providerPaymentId:
              payment.providerPaymentId,

            status:
              payment.status,

            amount:
              String(
                payment.amount,
              ),

            currency:
              payment.currency,
          },
        });

        return;
      }

      /* ===================================================
         UPDATE PAYMENT
      ==================================================== */

      payment.status =
        "cancelled";

      payment.failureMessage =
        "Customer cancelled the PayPal checkout.";

      await payment.save();

      /* ===================================================
         UPDATE PROVIDER TRANSACTION
      ==================================================== */

      const providerTransaction =
        await ProviderTransaction.findOne({
          provider:
            "paypal",

          paymentId:
            payment._id,

          externalTransactionId:
            token,

          transactionType:
            "payment",
        });

      if (
        providerTransaction
      ) {
        providerTransaction.status =
          "cancelled";

        providerTransaction.providerEventType =
          "CHECKOUT.ORDER.CANCELLED";

        providerTransaction.metadata =
          {
            ...providerTransaction.metadata,

            paypalOrderId:
              token,

            cancellationReason:
              "customer_cancelled",
          };

        await providerTransaction.save();
      } else {
        await ProviderTransaction.create({
          providerTransactionId:
            generateProviderTransactionId(),

          paymentId:
            payment._id,

          merchantId:
            payment.merchantId,

          provider:
            "paypal",

          mode:
            payment.mode,

          externalTransactionId:
            token,

          transactionType:
            "payment",

          status:
            "cancelled",

          amount:
            String(
              payment.amount,
            ),

          currency:
            payment.currency,

          providerEventType:
            "CHECKOUT.ORDER.CANCELLED",

          metadata: {
            paypalOrderId:
              token,

            cancellationReason:
              "customer_cancelled",
          },
        });
      }

      /* ===================================================
         RESPONSE
      ==================================================== */

      res.status(200).json({
        success: true,

        message:
          "PayPal payment was cancelled successfully.",

        data: {
          paymentId:
            payment.paymentId,

          provider:
            "paypal",

          providerPaymentId:
            payment.providerPaymentId,

          status:
            payment.status,

          amount:
            String(
              payment.amount,
            ),

          currency:
            payment.currency,
        },
      });
    } catch (
      error: unknown
    ) {
      next(error);
    }
  };

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  cancelPayPalPayment,
};