import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  getAnalystProviderAnalytics,
} from "../services/analystProviderService.js";

import type {
  AnalystPaymentMode,
  AnalystPaymentRange,
} from "../services/analystPaymentService.js";

/* =========================================================
   VALID VALUES
========================================================= */

const VALID_RANGES:
  readonly AnalystPaymentRange[] = [
    "24h",
    "7d",
    "30d",
    "90d",
  ];

const VALID_MODES:
  readonly AnalystPaymentMode[] = [
    "all",
    "test",
    "live",
  ];

/* =========================================================
   QUERY HELPERS
========================================================= */

function queryString(
  value:
    unknown
): string {
  if (
    typeof value ===
    "string"
  ) {
    return value.trim();
  }

  return "";
}

function parseRange(
  value:
    unknown
): AnalystPaymentRange {
  const normalized =
    queryString(
      value
    );

  if (
    VALID_RANGES.includes(
      normalized as
        AnalystPaymentRange
    )
  ) {
    return normalized as
      AnalystPaymentRange;
  }

  return "30d";
}

function parseMode(
  value:
    unknown
): AnalystPaymentMode {
  const normalized =
    queryString(
      value
    ).toLowerCase();

  if (
    VALID_MODES.includes(
      normalized as
        AnalystPaymentMode
    )
  ) {
    return normalized as
      AnalystPaymentMode;
  }

  return "all";
}

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

function parseProvider(
  value:
    unknown
): string | null {
  const normalized =
    queryString(
      value
    )
      .toLowerCase();

  if (
    !normalized
  ) {
    return "";
  }

  if (
    !/^[a-z0-9][a-z0-9_-]{0,49}$/.test(
      normalized
    )
  ) {
    return null;
  }

  return normalized;
}

/* =========================================================
   GET PROVIDER ANALYTICS

   GET /api/analyst/providers
========================================================= */

export const getAnalystProviderAnalyticsController =
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

      const mode =
        parseMode(
          req.query.mode
        );

      const currency =
        parseCurrency(
          req.query.currency
        );

      const provider =
        parseProvider(
          req.query.provider
        );

      /* ===================================================
         VALIDATION
      ==================================================== */

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

      if (
        provider ===
        null
      ) {
        res.status(
          400
        ).json({
          success:
            false,

          message:
            "Provider contains invalid characters.",
        });

        return;
      }

      /* ===================================================
         ANALYTICS
      ==================================================== */

      const data =
        await getAnalystProviderAnalytics({
          range,

          mode,

          currency,

          provider,
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
        "GET ANALYST PROVIDER ANALYTICS ERROR:",
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
          "Unable to load provider analytics.",
      });
    }
  };