import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  getSupportSlaMonitoring,
  getSupportSlaSummary,
} from "../services/supportSlaMonitoringService.js";

/* =========================================================
   SLA MONITORING
   GET /api/v1/support/sla
========================================================= */

export const getSupportSlaController =
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

      const priority =
        typeof req.query.priority ===
        "string"
          ? req.query.priority
          : undefined;

      const page =
        Number(
          req.query.page ?? 1
        );

      const limit =
        Number(
          req.query.limit ?? 20
        );

      const result =
        await getSupportSlaMonitoring({
          search,
          status,
          priority,
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
        "SUPPORT SLA ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(500).json({
        success: false,

        message:
          "Failed to load SLA monitoring data.",
      });
    }
  };

/* =========================================================
   SLA SUMMARY
   GET /api/v1/support/sla/summary
========================================================= */

export const getSupportSlaSummaryController =
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

      const summary =
        await getSupportSlaSummary();

      res.status(200).json({
        success: true,
        summary,
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "SUPPORT SLA SUMMARY ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(500).json({
        success: false,

        message:
          "Failed to load SLA summary.",
      });
    }
  };