import type {
  Request,
  Response,
} from "express";

import {
  getAnalystDisputeAnalytics,
  type AnalystDisputeStatus,
} from "../services/analystDisputeService.js";

import {
  AnalystFilterError,
  parseAnalystFilters,
} from "../utils/analystFilters.js";

/* =========================================================
   STATUS
========================================================= */

const STATUSES =
  new Set<
    AnalystDisputeStatus
  >([
    "all",
    "disputed",
    "under_review",
    "won",
    "lost",
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
): AnalystDisputeStatus {
  const normalized =
    queryValue(
      value
    ).toLowerCase() ||
    "all";

  if (
    STATUSES.has(
      normalized as
        AnalystDisputeStatus
    )
  ) {
    return normalized as
      AnalystDisputeStatus;
  }

  throw new AnalystFilterError(
    "status must be one of: all, disputed, under_review, won, lost."
  );
}

/* =========================================================
   GET /api/analyst/disputes
========================================================= */

export async function getAnalystDisputeAnalyticsController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const filters =
      parseAnalystFilters(
        req.query
      );

    const data =
      await getAnalystDisputeAnalytics({
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
      "ANALYST DISPUTE ERROR:",
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
        "Unable to load dispute analytics.",
    });
  }
}