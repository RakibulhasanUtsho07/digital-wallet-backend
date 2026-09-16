import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  getAnalystUserAnalytics,
  type AnalystUserRange,
} from "../services/analystUserService.js";

/* =========================================================
   RANGE
========================================================= */

const VALID_RANGES:
  readonly AnalystUserRange[] = [
    "24h",
    "7d",
    "30d",
    "90d",
  ];

function parseRange(
  value: unknown
): AnalystUserRange {
  if (
    typeof value ===
      "string" &&
    VALID_RANGES.includes(
      value as AnalystUserRange
    )
  ) {
    return value as AnalystUserRange;
  }

  return "30d";
}

/* =========================================================
   GET ANALYST USER ANALYTICS

   GET /api/analyst/users
========================================================= */

export const getAnalystUserAnalyticsController =
  async (
    _req:
      AuthRequest,

    res:
      Response
  ): Promise<void> => {
    try {
      const range =
        parseRange(
          _req.query.range
        );

      const data =
        await getAnalystUserAnalytics(
          range
        );

      res.status(
        200
      ).json({
        success:
          true,

        data,
      });
    } catch (
      error:
        unknown
    ) {
      console.error(
        "GET ANALYST USER ANALYTICS ERROR:",
        error instanceof
          Error
          ? error.message
          : error
      );

      res.status(
        500
      ).json({
        success:
          false,

        message:
          "Unable to load user analytics.",
      });
    }
  };