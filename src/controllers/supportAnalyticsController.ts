import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  getSupportDashboardAnalytics,
} from "../services/supportAnalyticsDashboardService.js";

/* =========================================================
   SUPPORT ANALYTICS
   GET /api/v1/support/analytics
========================================================= */

export const getSupportAnalyticsController =
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

      const days =
        Number(
          req.query.days ??
            30
        );

      const analytics =
        await getSupportDashboardAnalytics({
          days:
            Number.isFinite(
              days
            )
              ? days
              : 30,
        });

      res.status(200).json({
        success: true,
        analytics,
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "SUPPORT ANALYTICS ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(500).json({
        success: false,

        message:
          "Failed to load support analytics.",
      });
    }
  };