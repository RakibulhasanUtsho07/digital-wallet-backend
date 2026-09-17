import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  getSupportActivityLog,
} from "../services/supportActivityLogService.js";

/* =========================================================
   SUPPORT ACTIVITY LOG
   GET /api/v1/support/activity
========================================================= */

export const getSupportActivityController =
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

      const eventType =
        typeof req.query.eventType ===
        "string"
          ? req.query.eventType
          : undefined;

      const page =
        Number(
          req.query.page ??
            1
        );

      const limit =
        Number(
          req.query.limit ??
            30
        );

      const result =
        await getSupportActivityLog({
          search,
          eventType,
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
              : 30,
        });

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "SUPPORT ACTIVITY LOG ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(500).json({
        success: false,

        message:
          "Failed to load support activity.",
      });
    }
  };