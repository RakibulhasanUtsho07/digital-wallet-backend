import type {
  Request,
  Response,
} from "express";

import {
  getAnalystSettlementAnalytics,
  type AnalystSettlementStatus,
} from "../services/analystSettlementService.js";

import {
  AnalystFilterError,
  parseAnalystFilters,
} from "../utils/analystFilters.js";

/* =========================================================
   STATUS
========================================================= */

const STATUSES =
  new Set<
    AnalystSettlementStatus
  >([
    "all",
    "pending",
    "processing",
    "settled",
    "failed",
    "cancelled",
  ]);

function queryValue(
  value: unknown
): string {
  if (
    typeof value ===
    "string"
  ) {
    return value.trim();
  }

  if (
    Array.isArray(
      value
    ) &&
    typeof value[0] ===
      "string"
  ) {
    return value[0]
      .trim();
  }

  return "";
}

function parseStatus(
  value: unknown
): AnalystSettlementStatus {
  const normalized =
    queryValue(
      value
    ).toLowerCase() ||
    "all";

  if (
    STATUSES.has(
      normalized as
        AnalystSettlementStatus
    )
  ) {
    return normalized as
      AnalystSettlementStatus;
  }

  throw new AnalystFilterError(
    "status must be one of: all, pending, processing, settled, failed, cancelled."
  );
}

/* =========================================================
   GET /api/analyst/settlement
========================================================= */

export async function getAnalystSettlementAnalyticsController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const filters =
      parseAnalystFilters(
        req.query
      );

    /*
     * Settlement itself has no Test/Live mode.
     * Do not silently pretend mode filtering works.
     */
    if (
      filters.mode !==
      "all"
    ) {
      throw new AnalystFilterError(
        "Settlement analytics does not support Test/Live mode filtering."
      );
    }

    const data =
      await getAnalystSettlementAnalytics({
        filters,

        status:
          parseStatus(
            req.query.status
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
    error: unknown
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
      "ANALYST SETTLEMENT ERROR:",
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
        "Unable to load settlement analytics.",
    });
  }
}