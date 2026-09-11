import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  getMerchantOverview,
  type MerchantOverviewPeriod,
} from "../services/merchantOverviewService.js";

/* =========================================================
   GET MERCHANT OVERVIEW
========================================================= */

/*
 * GET /api/merchants/overview
 *
 * Query:
 *
 * ?period=1d
 * ?period=7d
 * ?period=30d
 * ?period=90d
 * ?period=12m
 * ?period=all
 */

export const getMerchantOverviewController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const userId =
        req.user?._id;

      if (!userId) {
        res.status(401).json({
          success:
            false,

          message:
            "Authentication is required.",
        });

        return;
      }

      const rawPeriod =
        typeof req.query.period ===
        "string"
          ? req.query.period
          : "30d";

      const allowedPeriods:
        MerchantOverviewPeriod[] =
        [
          "1d",
          "7d",
          "30d",
          "90d",
          "12m",
          "all",
        ];

      const period =
        allowedPeriods.includes(
          rawPeriod as MerchantOverviewPeriod
        )
          ? (rawPeriod as MerchantOverviewPeriod)
          : "30d";

      const overview =
        await getMerchantOverview({
          userId,
          period,
        });

      res.status(200).json({
        success:
          true,

        message:
          "Merchant overview loaded successfully.",

        data:
          overview,
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "MERCHANT OVERVIEW ERROR:",
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
          : "Unable to load merchant overview.";

      const statusCode =
        message.includes(
          "Merchant account not found"
        )
          ? 404
          : message.includes(
                "Invalid merchant owner ID"
              )
            ? 400
            : 500;

      res.status(
        statusCode
      ).json({
        success:
          false,

        message,
      });
    }
  };