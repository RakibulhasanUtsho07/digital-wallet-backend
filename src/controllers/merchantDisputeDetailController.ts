import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  getMerchantDisputeDetail,
} from "../services/merchantDisputeDetailService.js";

/* =========================================================
   GET MERCHANT DISPUTE DETAIL
   GET /api/merchants/disputes/:disputeId
========================================================= */

export const getMerchantDisputeDetailController =
  async (
    req: AuthRequest,
    res: Response,
  ): Promise<void> => {
    try {
      const userId =
        req.user?._id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message:
            "Authentication required.",
        });

        return;
      }

      const disputeId =
        typeof req.params.disputeId ===
        "string"
          ? req.params.disputeId
          : "";

      const result =
        await getMerchantDisputeDetail({
          ownerId:
            String(
              userId,
            ),

          disputeId,
        });

      res.status(200).json({
        success: true,

        data:
          result,
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "GET MERCHANT DISPUTE DETAIL ERROR:",
        error,
      );

      const message =
        error instanceof Error
          ? error.message
          : "Unable to load dispute details.";

      let status = 500;

      if (
        message ===
          "Authentication required." ||
        message ===
          "Authenticated merchant owner is required."
      ) {
        status = 401;
      } else if (
        message ===
          "Invalid merchant owner ID." ||
        message ===
          "Dispute ID is required."
      ) {
        status = 400;
      } else if (
        message ===
          "Merchant account not found." ||
        message ===
          "Dispute not found."
      ) {
        status = 404;
      }

      res.status(status).json({
        success: false,
        message,
      });
    }
  };