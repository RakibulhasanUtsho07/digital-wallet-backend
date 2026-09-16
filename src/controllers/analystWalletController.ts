import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  getAnalystWalletAnalytics,
  type AnalystWalletRange,
} from "../services/analystWalletService.js";

/* =========================================================
   VALID RANGE
========================================================= */

const VALID_RANGES:
  readonly AnalystWalletRange[] = [
    "24h",
    "7d",
    "30d",
    "90d",
  ];

/* =========================================================
   STRING
========================================================= */

function queryString(
  value:
    unknown
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

/* =========================================================
   RANGE
========================================================= */

function parseRange(
  value:
    unknown
): AnalystWalletRange {
  const normalized =
    queryString(
      value
    );

  if (
    VALID_RANGES.includes(
      normalized as
        AnalystWalletRange
    )
  ) {
    return normalized as
      AnalystWalletRange;
  }

  return "30d";
}

/* =========================================================
   CURRENCY
========================================================= */

function parseCurrency(
  value:
    unknown
): string | null {
  const normalized =
    queryString(
      value
    )
      .toUpperCase();

  if (
    !normalized
  ) {
    return "BDT";
  }

  if (
    !/^[A-Z]{3}$/.test(
      normalized
    )
  ) {
    return null;
  }

  return normalized;
}

/* =========================================================
   GET WALLET ANALYTICS

   GET /api/analyst/wallets
========================================================= */

export const getAnalystWalletAnalyticsController =
  async (
    req:
      AuthRequest,

    res:
      Response
  ): Promise<void> => {
    try {
      const range =
        parseRange(
          req.query.range
        );

      const currency =
        parseCurrency(
          req.query.currency
        );

      if (
        !currency
      ) {
        res.status(
          400
        ).json({
          success:
            false,

          message:
            "Currency must be a valid three-letter ISO code.",
        });

        return;
      }

      const data =
        await getAnalystWalletAnalytics({
          range,

          currency,
        });

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
        "GET ANALYST WALLET ANALYTICS ERROR:",
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
          "Unable to load wallet analytics.",
      });
    }
  };