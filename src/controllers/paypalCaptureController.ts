/* =========================================================
   PAYPAL CAPTURE CONTROLLER
   ---------------------------------------------------------
   Responsibilities:
   - Receive PayPal return request
   - Read PayPal order ID from "token"
   - Find internal Payment
   - Capture PayPal payment
   - Update Payment
   - Update PaymentAttempt
   - Update ProviderTransaction
   - Return capture result
========================================================= */

import type {
  Request,
  Response,
  NextFunction,
} from "express";
import type {
  Types,
} from "mongoose";
import {
  Payment,
} from "../models/Payment.js";

import {
  PaymentAttempt,
} from "../models/PaymentAttempt.js";

import {
  ProviderTransaction,
} from "../models/ProviderTransaction.js";

import {
  capturePayPalPayment as capturePayPalPaymentService,
} from "../services/payment/paypal/paypal.payments.js";

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

/* =========================================================
   GET CAPTURE ATTEMPT NUMBER
========================================================= */

/* =========================================================
   GET CAPTURE ATTEMPT NUMBER
========================================================= */
/* =========================================================
   GET CAPTURE ATTEMPT NUMBER
========================================================= */

const getNextCaptureAttemptNumber =
  async (
    paymentId: Types.ObjectId,
  ): Promise<number> => {
    const attempts =
      await PaymentAttempt.find({
        paymentId,

        operation:
          "capture",
      }).select({
        _id: 1,
      });

    return attempts.length + 1;
  };
/* =========================================================
   GENERATE ATTEMPT ID
========================================================= */

const generateAttemptId =
  (): string => {
    return `attempt_capture_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 12)}`;
  };

/* =========================================================
   GENERATE PROVIDER TRANSACTION ID
========================================================= */

const generateProviderTransactionId =
  (): string => {
    return `provider_tx_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 12)}`;
  };

/* =========================================================
   CAPTURE PAYPAL PAYMENT
   ---------------------------------------------------------
   GET /api/v1/payments/paypal/return?token=PAYPAL_ORDER_ID
========================================================= */

export const capturePayPalPayment =
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      /* ===================================================
         READ PAYPAL ORDER ID
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
         FIND INTERNAL PAYMENT
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
        res.status(200).json({
          success: true,

          message:
            "Payment has already been completed.",

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
         VALID CAPTURE STATE
      ==================================================== */

      if (
        payment.status !==
        "pending"
      ) {
        res.status(409).json({
          success: false,

          message:
            `Payment cannot be captured from status "${payment.status}".`,
        });

        return;
      }

      /* ===================================================
         ATTEMPT NUMBER
      ==================================================== */

      const attemptNumber =
        await getNextCaptureAttemptNumber(
          payment._id,
        );

      /* ===================================================
         CREATE CAPTURE ATTEMPT
      ==================================================== */

      const attempt =
        await PaymentAttempt.create({
          attemptId:
            generateAttemptId(),

          paymentId:
            payment._id,

          merchantId:
            payment.merchantId,

          provider:
            "paypal",

          operation:
            "capture",

          status:
            "processing",

          attemptNumber,
        });

      /* ===================================================
         CALL PAYPAL CAPTURE SERVICE
         --------------------------------------------------
         IMPORTANT:
         Alias avoids conflict with this controller's
         own capturePayPalPayment function.
      ==================================================== */

      try {
        const result =
          await capturePayPalPaymentService(
            token,
          );

        /* =================================================
           DETERMINE FINAL PAYMENT STATUS
        ================================================== */

        const isCompleted =
          result.status ===
          "COMPLETED";

        const isCaptured =
          result.status ===
          "CAPTURED";

        const finalPaymentStatus =
          isCompleted
            ? "completed"
            : isCaptured
              ? "captured"
              : "pending";

        /* =================================================
           UPDATE PAYMENT
        ================================================== */

        payment.providerPaymentId =
          result.providerPaymentId;

        payment.status =
          finalPaymentStatus;

        await payment.save();

        /* =================================================
           UPDATE CAPTURE ATTEMPT
        ================================================== */

        attempt.status =
          isCompleted ||
          isCaptured
            ? "captured"
            : "failed";

        attempt.providerRequestId =
          result.providerPaymentId;

        if (
          result.providerTransactionId
        ) {
          attempt.providerResponseId =
            result.providerTransactionId;
        }

        await attempt.save();

        /* =================================================
           FIND EXISTING PROVIDER TRANSACTION
        ================================================== */

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

        /* =================================================
           UPDATE EXISTING PROVIDER TRANSACTION
        ================================================= */

        if (
          providerTransaction
        ) {
          providerTransaction.status =
            isCompleted
              ? "completed"
              : isCaptured
                ? "captured"
                : "pending";

          /*
           * If PayPal returned a capture ID,
           * use that as the external transaction ID.
           * Otherwise keep the PayPal Order ID.
           */
          if (
            result.providerTransactionId
          ) {
            providerTransaction.externalTransactionId =
              result.providerTransactionId;
          }

          providerTransaction.providerEventType =
            isCompleted
              ? "PAYMENT.CAPTURE.COMPLETED"
              : "PAYMENT.CAPTURE";

          providerTransaction.metadata =
            {
              ...providerTransaction.metadata,

              paypalOrderId:
                result.providerPaymentId,

              paypalCaptureId:
                result.providerTransactionId,

              captureStatus:
                result.status,
            };

          await providerTransaction.save();
        } else {
          /* ===============================================
             FALLBACK TRANSACTION
          ================================================= */

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
              result.providerTransactionId ??
              token,

            transactionType:
              "capture",

            status:
              isCompleted
                ? "completed"
                : isCaptured
                  ? "captured"
                  : "pending",

            amount:
              result.amount ??
              String(
                payment.amount,
              ),

            currency:
              result.currency ??
              payment.currency,

            providerEventType:
              isCompleted
                ? "PAYMENT.CAPTURE.COMPLETED"
                : "PAYMENT.CAPTURE",

            metadata: {
              paypalOrderId:
                result.providerPaymentId,

              paypalCaptureId:
                result.providerTransactionId,

              captureStatus:
                result.status,
            },
          });
        }

        /* =================================================
           SUCCESS RESPONSE
        ================================================== */

        if (
          isCompleted ||
          isCaptured
        ) {
          res.status(200).json({
            success: true,

            message:
              "PayPal payment captured successfully.",

            data: {
              paymentId:
                payment.paymentId,

              provider:
                "paypal",

              providerPaymentId:
                result.providerPaymentId,

              providerTransactionId:
                result.providerTransactionId ??
                null,

              status:
                payment.status,

              amount:
                result.amount ??
                String(
                  payment.amount,
                ),

              currency:
                result.currency ??
                payment.currency,
            },
          });

          return;
        }

        /* =================================================
           NON-FINAL RESPONSE
        ================================================== */

        res.status(202).json({
          success: true,

          message:
            "PayPal payment capture is not yet in a final completed state.",

          data: {
            paymentId:
              payment.paymentId,

            provider:
              "paypal",

            providerPaymentId:
              result.providerPaymentId,

            providerTransactionId:
              result.providerTransactionId ??
              null,

            status:
              payment.status,

            amount:
              result.amount ??
              String(
                payment.amount,
              ),

            currency:
              result.currency ??
              payment.currency,
          },
        });
      } catch (
        error: unknown
      ) {
        /* =================================================
           MARK ATTEMPT FAILED
        ================================================== */

        attempt.status =
          "failed";

        attempt.failureCode =
          "provider_error";

        attempt.failureMessage =
          error instanceof Error
            ? error.message
            : "PayPal capture failed.";

        await attempt.save();

        /* =================================================
           MARK PAYMENT FAILED
        ================================================== */

        payment.status =
          "failed";

        payment.failureMessage =
          error instanceof Error
            ? error.message
            : "PayPal capture failed.";

        await payment.save();

        throw error;
      }
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
  capturePayPalPayment,
};