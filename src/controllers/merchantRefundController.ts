import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import type {
  MerchantApiScope,
} from "../models/MerchantApiKey.js";

import {
  createMerchantRefund,
  getMerchantApiRefund,
  getMerchantDashboardRefund,
  listMerchantDashboardRefunds,
  MerchantRefundError,
} from "../services/merchantRefundService.js";

/* =========================================================
   REQUEST TYPE
========================================================= */

interface MerchantApiRequest
  extends AuthRequest {
  merchant?: {
    _id: string;

    ownerId: string;

    businessName: string;

    slug: string;

    status: string;

    verificationStatus:
      string;

    defaultCurrency:
      string;

    environment:
      "test" | "live";

    apiKeyId: string;

    scopes:
      MerchantApiScope[];
  };
}

/* =========================================================
   HELPERS
========================================================= */

const readText = (
  value: unknown
): string => {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
};

const readHeader = (
  value: unknown
): string => {
  if (
    typeof value ===
    "string"
  ) {
    return value.trim();
  }

  if (
    Array.isArray(value)
  ) {
    const first =
      value[0];

    return typeof first ===
      "string"
      ? first.trim()
      : "";
  }

  return "";
};

const handleRefundError = (
  error: unknown,

  res: Response
): void => {
  if (
    error instanceof
    MerchantRefundError
  ) {
    res.status(
      error.statusCode
    ).json({
      success: false,

      code:
        error.code,

      message:
        error.message,
    });

    return;
  }

  console.error(
    "MERCHANT REFUND ERROR:",

    error instanceof Error
      ? error.message
      : error
  );

  res.status(500).json({
    success: false,

    message:
      "Unable to process refund.",
  });
};

/* =========================================================
   CREATE REFUND
   POST /api/v1/refunds
========================================================= */

export const createMerchantRefundController =
  async (
    req:
      MerchantApiRequest,

    res:
      Response
  ): Promise<void> => {
    try {
      const merchant =
        req.merchant;

      if (!merchant) {
        res.status(401).json({
          success: false,

          message:
            "Merchant authentication is required.",
        });

        return;
      }

      const body =
        (
          req.body &&
          typeof req.body ===
            "object"
        )
          ? req.body as
              Record<
                string,
                unknown
              >
          : {};

      const paymentId =
        readText(
          body.paymentId
        );

      const idempotencyKey =
        readHeader(
          req.headers[
            "idempotency-key"
          ]
        );

      const result =
        await createMerchantRefund({
          merchantId:
            merchant._id,

          environment:
            merchant.environment,

          paymentId,

          amount:
            body.amount,

          reason:
            body.reason,

          merchantReference:
            body.merchantReference,

          idempotencyKey,
        });

      res.status(
        result.duplicate
          ? 200
          : 201
      ).json({
        success: true,

        duplicate:
          result.duplicate,

        message:
          result.duplicate
            ? "Existing refund returned."
            : "Refund completed successfully.",

        refund:
          result.refund,
      });
    } catch (
      error: unknown
    ) {
      handleRefundError(
        error,
        res
      );
    }
  };

/* =========================================================
   GET REFUND THROUGH API KEY
   GET /api/v1/refunds/:refundId
========================================================= */

export const getMerchantApiRefundController =
  async (
    req:
      MerchantApiRequest,

    res:
      Response
  ): Promise<void> => {
    try {
      const merchant =
        req.merchant;

      if (!merchant) {
        res.status(401).json({
          success: false,

          message:
            "Merchant authentication is required.",
        });

        return;
      }

      const refundId =
        readText(
          req.params.refundId
        );

      const refund =
        await getMerchantApiRefund({
          merchantId:
            merchant._id,

          environment:
            merchant.environment,

          refundId,
        });

      res.status(200).json({
        success: true,

        refund,
      });
    } catch (
      error: unknown
    ) {
      handleRefundError(
        error,
        res
      );
    }
  };

/* =========================================================
   DASHBOARD REFUND LIST
   GET /api/merchants/refunds
========================================================= */

export const listMerchantRefundsController =
  async (
    req:
      AuthRequest,

    res:
      Response
  ): Promise<void> => {
    try {
      const ownerId =
        req.user?._id;

      if (!ownerId) {
        res.status(401).json({
          success: false,

          message:
            "Authentication is required.",
        });

        return;
      }

      const page =
        Number(
          readText(
            req.query.page
          ) ||
          1
        );

      const limit =
        Number(
          readText(
            req.query.limit
          ) ||
          20
        );

      const result =
        await listMerchantDashboardRefunds({
          ownerId,

          status:
            readText(
              req.query.status
            ) ||
            undefined,

          mode:
            readText(
              req.query.mode
            ) ||
            undefined,

          search:
            readText(
              req.query.search
            ) ||
            undefined,

          page,

          limit,
        });

      res.status(200).json({
        success: true,

        refunds:
          result.refunds,

        pagination:
          result.pagination,
      });
    } catch (
      error: unknown
    ) {
      handleRefundError(
        error,
        res
      );
    }
  };

/* =========================================================
   DASHBOARD REFUND DETAIL
   GET /api/merchants/refunds/:refundId
========================================================= */

export const getMerchantDashboardRefundController =
  async (
    req:
      AuthRequest,

    res:
      Response
  ): Promise<void> => {
    try {
      const ownerId =
        req.user?._id;

      if (!ownerId) {
        res.status(401).json({
          success: false,

          message:
            "Authentication is required.",
        });

        return;
      }

      const refundId =
        readText(
          req.params.refundId
        );

      const refund =
        await getMerchantDashboardRefund({
          ownerId,

          refundId,
        });

      res.status(200).json({
        success: true,

        refund,
      });
    } catch (
      error: unknown
    ) {
      handleRefundError(
        error,
        res
      );
    }
  };