import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  getMerchantAnalytics,
} from "../services/merchantAnalyticsService.js";

/* =========================================================
   GET MERCHANT ANALYTICS
   GET /api/merchants/analytics
========================================================= */

export async function getMerchantAnalyticsController(
  req: AuthRequest,
  res: Response
): Promise<void> {
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

    const result =
      await getMerchantAnalytics({
        ownerId,

        period:
          req.query.period,

        from:
          req.query.from,

        to:
          req.query.to,
      });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (
    error: unknown
  ) {
    console.error(
      "GET MERCHANT ANALYTICS ERROR:",
      error
    );

    res.status(400).json({
      success: false,

      message:
        error instanceof Error
          ? error.message
          : "Unable to load merchant analytics.",
    });
  }
}