import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  confirmWalletPayment,
  createWalletPayment,
  getCustomerCheckoutPayment,
  getWalletPayment,
} from "../services/walletPaymentService.js";

/* =========================================================
   MERCHANT REQUEST TYPE
========================================================= */

interface MerchantRequest
  extends AuthRequest {
  merchant?: {
    _id: string;
    ownerId: string;
    businessName: string;
    slug: string;
    status: string;
    verificationStatus: string;
    defaultCurrency: string;
    environment:
      | "test"
      | "live";
    apiKeyId: string;
    scopes?: string[];
  };
}

/* =========================================================
   HELPERS
========================================================= */

const stringValue = (
  value: unknown
): string => {
  return typeof value === "string"
    ? value.trim()
    : "";
};

const errorMessage = (
  error: unknown
): string => {
  return error instanceof Error
    ? error.message
    : "Payment request failed.";
};

/* =========================================================
   CREATE MERCHANT PAYMENT
 *
 * POST /api/v1/payments
========================================================= */

export const createMerchantPaymentController =
  async (
    req: MerchantRequest,
    res: Response
  ): Promise<void> => {
    try {
      const merchant =
        req.merchant;

      if (!merchant?._id) {
        res.status(401).json({
          success: false,
          message:
            "Merchant authentication required.",
        });

        return;
      }

      const {
        customerId,
        amount,
        currency,
        orderId,
        merchantReference,
        returnUrl,
        cancelUrl,
      } =
        req.body ?? {};

      const idempotencyKey =
        stringValue(
          req.get(
            "Idempotency-Key"
          )
        );

      /* ===================================================
         IDEMPOTENCY
      ================================================== */

      if (
        !idempotencyKey
      ) {
        res.status(400).json({
          success: false,
          message:
            "Idempotency-Key header is required.",
        });

        return;
      }

      if (
        idempotencyKey.length >
        200
      ) {
        res.status(400).json({
          success: false,
          message:
            "Idempotency-Key is too long.",
        });

        return;
      }

      /* ===================================================
         CUSTOMER
      ================================================== */

      const normalizedCustomerId =
        stringValue(
          customerId
        );

      if (
        !normalizedCustomerId
      ) {
        res.status(400).json({
          success: false,
          message:
            "customerId is required.",
        });

        return;
      }

      /* ===================================================
         CREATE PAYMENT
      ================================================== */

      const result =
        await createWalletPayment({
          merchantId:
            merchant._id,

          customerId:
            normalizedCustomerId,

          amount,

          currency,

          orderId,

          merchantReference,

          returnUrl,

          cancelUrl,

          mode:
            merchant.environment,

          idempotencyKey,
        });

      const payment =
        result.payment;

      /* ===================================================
         RESPONSE
      ================================================== */

      res.status(
        result.duplicate
          ? 200
          : 201
      ).json({
        success: true,

        duplicate:
          result.duplicate,

        payment: {
          id:
            payment.paymentId,

          status:
            payment.status,

          amount:
            payment.amount.toString(),

          currency:
            payment.currency,

          merchantId:
            payment.merchantId.toString(),

          customerId:
            payment.customerId?.toString(),

          orderId:
            payment.orderId,

          merchantReference:
            payment.merchantReference,

          mode:
            payment.mode,

          sourceType:
            payment.sourceType,

          provider:
            payment.provider,

          checkoutUrl:
            payment.checkoutUrl,

          returnUrl:
            payment.returnUrl,

          cancelUrl:
            payment.cancelUrl,

          createdAt:
            payment.createdAt,
        },
      });
    } catch (error) {
      console.error(
        "CREATE MERCHANT PAYMENT ERROR:",
        error
      );

      if (
        res.headersSent
      ) {
        return;
      }

      res.status(400).json({
        success: false,

        message:
          errorMessage(
            error
          ),
      });
    }
  };

/* =========================================================
   GET MERCHANT PAYMENT
 *
 * GET /api/v1/payments/:paymentId
========================================================= */

export const getMerchantPaymentController =
  async (
    req: MerchantRequest,
    res: Response
  ): Promise<void> => {
    try {
      const merchant =
        req.merchant;

      if (!merchant?._id) {
        res.status(401).json({
          success: false,
          message:
            "Merchant authentication required.",
        });

        return;
      }

      const paymentId =
        stringValue(
          req.params.paymentId
        );

      if (!paymentId) {
        res.status(400).json({
          success: false,
          message:
            "Payment ID is required.",
        });

        return;
      }

      const payment =
        await getWalletPayment({
          paymentId,

          merchantId:
            merchant._id,
        });

      res.status(200).json({
        success: true,

        payment: {
          id:
            payment.paymentId,

          status:
            payment.status,

          amount:
            payment.amount.toString(),

          currency:
            payment.currency,

          merchantId:
            payment.merchantId.toString(),

          customerId:
            payment.customerId?.toString(),

          orderId:
            payment.orderId,

          merchantReference:
            payment.merchantReference,

          sourceType:
            payment.sourceType,

          provider:
            payment.provider,

          mode:
            payment.mode,

          failureCode:
            payment.failureCode,

          failureMessage:
            payment.failureMessage,

          checkoutUrl:
            payment.checkoutUrl,

          returnUrl:
            payment.returnUrl,

          cancelUrl:
            payment.cancelUrl,

          createdAt:
            payment.createdAt,

          authorizedAt:
            payment.authorizedAt,

          capturedAt:
            payment.capturedAt,

          completedAt:
            payment.completedAt,

          failedAt:
            payment.failedAt,

          cancelledAt:
            payment.cancelledAt,

          expiredAt:
            payment.expiredAt,
        },
      });
    } catch (error) {
      console.error(
        "GET MERCHANT PAYMENT ERROR:",
        error
      );

      const message =
        errorMessage(
          error
        );

      res.status(
        message ===
          "Payment not found."
          ? 404
          : 400
      ).json({
        success: false,
        message,
      });
    }
  };

/* =========================================================
   GET CUSTOMER CHECKOUT PAYMENT
 *
 * GET /api/v1/payments/:paymentId/checkout
========================================================= */

export const getCustomerCheckoutPaymentController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const customerId =
        req.user?._id;

      if (!customerId) {
        res.status(401).json({
          success: false,
          message:
            "Customer authentication required.",
        });

        return;
      }

      const paymentId =
        stringValue(
          req.params.paymentId
        );

      if (!paymentId) {
        res.status(400).json({
          success: false,
          message:
            "Payment ID is required.",
        });

        return;
      }

      const payment =
        await getCustomerCheckoutPayment({
          paymentId,

          customerId:
            customerId.toString(),
        });

      res.status(200).json({
        success: true,

        payment: {
          id:
            payment.paymentId,

          status:
            payment.status,

          amount:
            payment.amount.toString(),

          currency:
            payment.currency,

          merchantId:
            payment.merchantId.toString(),

          customerId:
            payment.customerId?.toString(),

          orderId:
            payment.orderId,

          merchantReference:
            payment.merchantReference,

          provider:
            payment.provider,

          sourceType:
            payment.sourceType,

          mode:
            payment.mode,

          returnUrl:
            payment.returnUrl,

          cancelUrl:
            payment.cancelUrl,

          createdAt:
            payment.createdAt,

          authorizedAt:
            payment.authorizedAt,

          capturedAt:
            payment.capturedAt,

          completedAt:
            payment.completedAt,

          failedAt:
            payment.failedAt,

          cancelledAt:
            payment.cancelledAt,

          expiredAt:
            payment.expiredAt,
        },
      });
    } catch (error) {
      console.error(
        "GET CUSTOMER CHECKOUT PAYMENT ERROR:",
        error
      );

      const message =
        errorMessage(
          error
        );

      res.status(
        message ===
          "Payment not found."
          ? 404
          : 400
      ).json({
        success: false,
        message,
      });
    }
  };

/* =========================================================
   CONFIRM WALLET PAYMENT
 *
 * POST /api/v1/payments/:paymentId/confirm
========================================================= */

export const confirmMerchantWalletPaymentController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const customerId =
        req.user?._id;

      if (!customerId) {
        res.status(401).json({
          success: false,
          message:
            "Customer authentication required.",
        });

        return;
      }

      const paymentId =
        stringValue(
          req.params.paymentId
        );

      if (!paymentId) {
        res.status(400).json({
          success: false,
          message:
            "Payment ID is required.",
        });

        return;
      }

      const result =
        await confirmWalletPayment({
          paymentId,

          customerId:
            customerId.toString(),
        });

      res.status(200).json({
        success: true,

        duplicate:
          result.duplicate,

        message:
          result.duplicate
            ? "Payment was already completed."
            : "Payment completed successfully.",

        payment: {
          id:
            result.payment.paymentId,

          status:
            result.payment.status,

          amount:
            result.payment.amount.toString(),

          currency:
            result.payment.currency,

          merchantId:
            result.payment.merchantId.toString(),

          customerId:
            result.payment.customerId?.toString(),

          orderId:
            result.payment.orderId,

          provider:
            result.payment.provider,

          sourceType:
            result.payment.sourceType,

          completedAt:
            result.payment.completedAt,
        },

        ...(result.wallet
          ? {
              wallet:
                result.wallet,
            }
          : {}),
      });
    } catch (error) {
      console.error(
        "CONFIRM MERCHANT WALLET PAYMENT ERROR:",
        error
      );

      const message =
        errorMessage(
          error
        );

      let statusCode =
        400;

      if (
        message ===
          "Payment not found." ||
        message ===
          "Customer wallet not found or is not active."
      ) {
        statusCode =
          404;
      }

      if (
        message ===
        "You are not authorized to approve this payment."
      ) {
        statusCode =
          403;
      }

      if (
        message ===
        "You are not authorized to access this payment."
      ) {
        statusCode =
          403;
      }

      if (
        message ===
        "Insufficient wallet balance."
      ) {
        statusCode =
          400;
      }

      res.status(
        statusCode
      ).json({
        success: false,
        message,
      });
    }
  };