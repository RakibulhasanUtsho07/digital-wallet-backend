import type {
  Request,
  Response,
} from "express";

import {
  listMerchantPayments,
  type MerchantPaymentMode,
  type MerchantPaymentStatus,
} from "../services/merchantPaymentListService.js";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

/* =========================================================
   VALID VALUES
========================================================= */

const PAYMENT_STATUSES:
  MerchantPaymentStatus[] = [
  "pending",
  "authorized",
  "captured",
  "completed",
  "failed",
  "cancelled",
  "expired",
];

const PAYMENT_MODES:
  MerchantPaymentMode[] = [
  "test",
  "live",
];

/* =========================================================
   CONTROLLER
========================================================= */

export const getMerchantPaymentsController =
  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const authReq =
        req as AuthRequest;

      const userId =
        authReq.user?._id;

      if (!userId) {
        res.status(401).json({
          success:
            false,

          message:
            "Authentication is required.",
        });

        return;
      }

      /* ===================================================
         QUERY
      =================================================== */

      const page =
        typeof req.query.page ===
        "string"
          ? Number(
              req.query.page
            )
          : 1;

      const limit =
        typeof req.query.limit ===
        "string"
          ? Number(
              req.query.limit
            )
          : 20;

      const search =
        typeof req.query.search ===
        "string"
          ? req.query.search
          : "";

      const statusValue =
        typeof req.query.status ===
        "string"
          ? req.query.status
          : "";

      const modeValue =
        typeof req.query.mode ===
        "string"
          ? req.query.mode
          : "";

      const provider =
        typeof req.query.provider ===
        "string"
          ? req.query.provider
          : "";

      const sourceType =
        typeof req.query.sourceType ===
        "string"
          ? req.query.sourceType
          : "";

      const from =
        typeof req.query.from ===
        "string"
          ? req.query.from
          : "";

      const to =
        typeof req.query.to ===
        "string"
          ? req.query.to
          : "";

      const status =
        PAYMENT_STATUSES.includes(
          statusValue as MerchantPaymentStatus
        )
          ? (statusValue as MerchantPaymentStatus)
          : undefined;

      const mode =
        PAYMENT_MODES.includes(
          modeValue as MerchantPaymentMode
        )
          ? (modeValue as MerchantPaymentMode)
          : undefined;

      /* ===================================================
         SERVICE
      =================================================== */

      const result =
        await listMerchantPayments({
          userId,

          page,

          limit,

          search,

          status,

          mode,

          provider,

          sourceType,

          from,

          to,
        });

      /* ===================================================
         RESPONSE
      =================================================== */

      res.status(200).json({
        success:
          true,

        message:
          "Merchant payments loaded successfully.",

        data: result,
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "MERCHANT PAYMENTS LIST ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      if (
        res.headersSent
      ) {
        return;
      }

      const message =
        error instanceof Error
          ? error.message
          : "Unable to load merchant payments.";

      let statusCode =
        500;

      if (
        message.includes(
          "Authentication is required"
        )
      ) {
        statusCode =
          401;
      }

      if (
        message.includes(
          "Invalid merchant owner ID"
        )
      ) {
        statusCode =
          400;
      }

      if (
        message.includes(
          "Merchant account not found"
        )
      ) {
        statusCode =
          404;
      }

      res.status(
        statusCode
      ).json({
        success:
          false,

        message,
      });
    }
  };