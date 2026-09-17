import type {
  Request,
  Response,
} from "express";

import {
  getAnalystRefundAnalytics,
  type AnalystRefundStatus,
} from "../services/analystRefundService.js";

import {
  AnalystFilterError,
  parseAnalystFilters,
} from "../utils/analystFilters.js";

/* =========================================================
   STATUS
========================================================= */

const REFUND_STATUSES =
  new Set<
    AnalystRefundStatus
  >([
    "all",
    "pending",
    "completed",
    "failed",
    "cancelled",
  ]);

/* =========================================================
   HELPER
========================================================= */

function queryValue(
  value:
    unknown
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
  value:
    unknown
): AnalystRefundStatus {
  const normalized =
    queryValue(
      value
    ).toLowerCase() ||
    "all";

  if (
    REFUND_STATUSES.has(
      normalized as
        AnalystRefundStatus
    )
  ) {
    return normalized as
      AnalystRefundStatus;
  }

  throw new AnalystFilterError(
    "status must be one of: all, pending, completed, failed, cancelled."
  );
}

/* =========================================================
   GET REFUND ANALYTICS

   GET /api/analyst/refunds
========================================================= */

export async function getAnalystRefundAnalyticsController(
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
      await getAnalystRefundAnalytics({
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
      "ANALYST REFUND ERROR:",
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
        "Unable to load refund analytics.",
    });
  }
}