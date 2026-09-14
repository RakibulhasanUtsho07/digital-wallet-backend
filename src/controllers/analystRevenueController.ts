import type {
  Request,
  Response,
} from "express";

import {
  getAnalystRevenueAnalytics,
  type AnalystRevenueKind,
} from "../services/analystRevenueService.js";

import {
  AnalystFilterError,
  parseAnalystFilters,
} from "../utils/analystFilters.js";

/* =========================================================
   ALLOWED KINDS
========================================================= */

const KINDS =
  new Set<
    AnalystRevenueKind
  >([
    "all",
    "TRANSFER_FEE",
    "WITHDRAWAL_FEE",
    "DEPOSIT_FEE",
    "SERVICE_FEE",
    "MERCHANT_FEE",
    "REFUND",
    "FEE_WAIVER",
    "GATEWAY_REVERSAL",
    "MICRO_FEE_ADJUSTMENT",
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

function parseKind(
  input:
    unknown
): AnalystRevenueKind {
  const raw =
    queryValue(
      input
    );

  if (!raw) {
    return "all";
  }

  if (
    raw.toLowerCase() ===
    "all"
  ) {
    return "all";
  }

  const normalized =
    raw.toUpperCase() as
      AnalystRevenueKind;

  if (
    KINDS.has(
      normalized
    )
  ) {
    return normalized;
  }

  throw new AnalystFilterError(
    "kind is not a supported revenue event type."
  );
}

/* =========================================================
   GET ANALYST REVENUE

   GET /api/analyst/revenue
========================================================= */

export async function getAnalystRevenueAnalyticsController(
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
      await getAnalystRevenueAnalytics({
        filters,

        kind:
          parseKind(
            req.query.kind
          ),
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
      "ANALYST REVENUE ERROR:",
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
        "Unable to load analyst revenue intelligence.",
    });
  }
}