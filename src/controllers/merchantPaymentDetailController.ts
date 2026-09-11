import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  getMerchantPaymentDetail,
} from "../services/merchantPaymentDetailService.js";

/* =========================================================
   GET MERCHANT PAYMENT DETAIL

   GET /api/merchants/payments/:paymentId
========================================================= */

export const getMerchantPaymentDetailController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const userId =
        req.user?._id;

      const rawPaymentId =
        req.params.paymentId;

      const paymentId =
        typeof rawPaymentId === "string"
          ? rawPaymentId.trim()
          : "";

      /* =====================================================
         AUTHENTICATION
      ====================================================== */

      if (!userId) {
        res.status(401).json({
          success: false,
          message:
            "Authentication required.",
        });

        return;
      }

      /* =====================================================
         VALIDATION
      ====================================================== */

      if (!paymentId) {
        res.status(400).json({
          success: false,
          message:
            "Payment ID is required.",
        });

        return;
      }

      /* =====================================================
         LOAD PAYMENT
      ====================================================== */

      const result =
        await getMerchantPaymentDetail({
          ownerId:
            String(userId),

          paymentId,
        });

      res.status(200).json({
        success: true,

        merchant:
          result.merchant,

        payment:
          result.payment,
      });
    } catch (error: unknown) {
      console.error(
        "GET MERCHANT PAYMENT DETAIL ERROR:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : "Unable to load payment details.";

      if (
        message ===
          "Merchant account not found." ||
        message ===
          "Payment not found."
      ) {
        res.status(404).json({
          success: false,
          message,
        });

        return;
      }

      if (
        message ===
          "Invalid merchant owner ID." ||
        message ===
          "Payment ID is required." ||
        message ===
          "Authenticated merchant owner is required."
      ) {
        res.status(400).json({
          success: false,
          message,
        });

        return;
      }

      res.status(500).json({
        success: false,
        message:
          "Unable to load payment details.",
      });
    }
  };