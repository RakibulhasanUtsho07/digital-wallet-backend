import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  getMerchantDisputes,
} from "../services/merchantDisputeService.js";

/* =========================================================
   GET MERCHANT DISPUTES
   GET /api/merchants/disputes
========================================================= */

export const getMerchantDisputesController =
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

      const result =
        await getMerchantDisputes({
          ownerId:
            String(userId),

          page:
            req.query.page,

          limit:
            req.query.limit,

          search:
            req.query.search,

          status:
            req.query.status,

          from:
            req.query.from,

          to:
            req.query.to,
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
        "GET MERCHANT DISPUTES ERROR:",
        error,
      );

      const message =
        error instanceof Error
          ? error.message
          : "Unable to load merchant disputes.";

      if (
        message ===
          "Authentication required." ||
        message ===
          "Authenticated merchant owner is required."
      ) {
        res.status(401).json({
          success: false,
          message,
        });

        return;
      }

      if (
        message ===
          "Invalid merchant owner ID."
      ) {
        res.status(400).json({
          success: false,
          message,
        });

        return;
      }

      if (
        message ===
          "Merchant account not found."
      ) {
        res.status(404).json({
          success: false,
          message,
        });

        return;
      }

      res.status(500).json({
        success: false,
        message,
      });
    }
  };