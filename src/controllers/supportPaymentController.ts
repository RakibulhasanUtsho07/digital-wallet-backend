import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  searchSupportPayments,
  getSupportPaymentDetail,
} from "../services/supportPaymentService.js";

/* =========================================================
   PAYMENT SEARCH
   GET /api/v1/support/payments
========================================================= */

export const searchSupportPaymentsController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      if (
        !req.user?._id
      ) {
        res.status(401).json({
          success: false,

          message:
            "Authentication required.",
        });

        return;
      }

      const search =
        typeof req.query.search ===
        "string"
          ? req.query.search
          : undefined;

      const status =
        typeof req.query.status ===
        "string"
          ? req.query.status
          : undefined;

      const provider =
        typeof req.query.provider ===
        "string"
          ? req.query.provider
          : undefined;

      const sourceType =
        typeof req.query.sourceType ===
        "string"
          ? req.query.sourceType
          : undefined;

      const mode =
        typeof req.query.mode ===
        "string"
          ? req.query.mode
          : undefined;

      const page =
        Number(
          req.query.page ??
            1
        );

      const limit =
        Number(
          req.query.limit ??
            20
        );

      const result =
        await searchSupportPayments({
          search,
          status,
          provider,
          sourceType,
          mode,
          page:
            Number.isFinite(
              page
            )
              ? page
              : 1,
          limit:
            Number.isFinite(
              limit
            )
              ? limit
              : 20,
        });

      res.status(200).json({
        success: true,

        ...result,
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "SUPPORT PAYMENT SEARCH ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(500).json({
        success: false,

        message:
          "Failed to search payments.",
      });
    }
  };

/* =========================================================
   PAYMENT DETAIL
   GET /api/v1/support/payments/:paymentId
========================================================= */

export const getSupportPaymentDetailController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      if (
        !req.user?._id
      ) {
        res.status(401).json({
          success: false,

          message:
            "Authentication required.",
        });

        return;
      }

      const paymentId =
        typeof req.params.paymentId ===
        "string"
          ? req.params.paymentId
          : "";

      const payment =
        await getSupportPaymentDetail(
          paymentId
        );

      if (
        !payment
      ) {
        res.status(404).json({
          success: false,

          message:
            "Payment not found.",
        });

        return;
      }

      res.status(200).json({
        success: true,

        payment,
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "SUPPORT PAYMENT DETAIL ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(500).json({
        success: false,

        message:
          "Failed to load payment details.",
      });
    }
  };