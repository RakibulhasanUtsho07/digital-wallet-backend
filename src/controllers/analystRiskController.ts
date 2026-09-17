import type {
  Request,
  Response,
} from "express";

import {
  getAnalystRiskAnalytics,
  type AnalystRiskSource,
} from "../services/analystRiskService.js";

import {
  AnalystFilterError,
  parseAnalystFilters,
} from "../utils/analystFilters.js";

/* =========================================================
   SOURCES
========================================================= */

const SOURCES =
  new Set<
    AnalystRiskSource
  >([
    "all",
    "wallet",
    "card",
    "paypal",
    "local_psp",
  ]);

/* =========================================================
   HELPERS
========================================================= */

function queryValue(
  input:
    unknown
): string {
  if (
    typeof input ===
    "string"
  ) {
    return input.trim();
  }

  if (
    Array.isArray(
      input
    ) &&
    typeof input[0] ===
      "string"
  ) {
    return input[0]
      .trim();
  }

  return "";
}

function parseProvider(
  input:
    unknown
): string {
  const value =
    queryValue(
      input
    ).toLowerCase();

  if (
    !value
  ) {
    return "";
  }

  if (
    value.length >
      50 ||
    !/^[a-z0-9][a-z0-9_-]*$/.test(
      value
    )
  ) {
    throw new AnalystFilterError(
      "provider contains invalid characters."
    );
  }

  return value;
}

function parseSource(
  input:
    unknown
): AnalystRiskSource {
  const value =
    queryValue(
      input
    ).toLowerCase() ||
    "all";

  if (
    SOURCES.has(
      value as
        AnalystRiskSource
    )
  ) {
    return value as
      AnalystRiskSource;
  }

  throw new AnalystFilterError(
    "source must be one of: all, wallet, card, paypal, local_psp."
  );
}

/* =========================================================
   GET RISK ANALYTICS

   GET /api/analyst/risk
========================================================= */

export async function getAnalystRiskAnalyticsController(
  req:
    Request,
  res:
    Response
): Promise<void> {
  try {
    const filters =
      parseAnalystFilters(
        req.query
      );

    const data =
      await getAnalystRiskAnalytics({
        filters,

        provider:
          parseProvider(
            req.query.provider
          ),

        source:
          parseSource(
            req.query.source
          ),
      });

    res.setHeader(
      "Cache-Control",
      "private, no-store, max-age=0"
    );

    res.setHeader(
      "Pragma",
      "no-cache"
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
    if (
      error instanceof
      AnalystFilterError
    ) {
      res.status(
        400
      ).json({
        success:
          false,

        message:
          error.message,
      });

      return;
    }

    console.error(
      "ANALYST RISK ERROR:",
      error instanceof
        Error
        ? error.message
        : error
    );

    if (
      res.headersSent
    ) {
      return;
    }

    res.status(
      500
    ).json({
      success:
        false,

      message:
        "Unable to load risk analytics.",
    });
  }
}