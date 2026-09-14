import type {
  Request,
  Response,
} from "express";

import {
  getAnalystTransactionAnalytics,
  type AnalystTransactionRisk,
  type AnalystTransactionStatus,
  type AnalystTransactionType,
} from "../services/analystTransactionService.js";

import type {
  AnalystRange,
} from "../types/analystTypes.js";

/* =========================================================
   ERROR
========================================================= */

class AnalystTransactionFilterError
  extends Error {}

/* =========================================================
   CONSTANTS
========================================================= */

const RANGES:
  AnalystRange[] = [
    "24h",
    "7d",
    "30d",
    "90d",
  ];

const STATUSES:
  AnalystTransactionStatus[] = [
    "all",
    "PENDING",
    "COMPLETED",
    "FAILED",
  ];

const TYPES:
  AnalystTransactionType[] = [
    "all",
    "TRANSFER",
    "DEPOSIT",
    "WITHDRAW",
  ];

const RISKS:
  AnalystTransactionRisk[] = [
    "all",
    "LOW",
    "MEDIUM",
    "HIGH",
    "CRITICAL",
  ];

/* =========================================================
   HELPERS
========================================================= */

function queryValue(
  value:
    unknown
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function parseRange(
  value:
    unknown
): AnalystRange {
  const normalized =
    queryValue(
      value
    ).toLowerCase() ||
    "30d";

  if (
    RANGES.includes(
      normalized as
        AnalystRange
    )
  ) {
    return normalized as
      AnalystRange;
  }

  throw new AnalystTransactionFilterError(
    "Range must be 24h, 7d, 30d, or 90d."
  );
}

function parseCurrency(
  value:
    unknown
): string {
  const normalized =
    queryValue(
      value
    ).toUpperCase() ||
    "BDT";

  if (
    !/^[A-Z]{3}$/.test(
      normalized
    )
  ) {
    throw new AnalystTransactionFilterError(
      "Currency must be a three-letter ISO code."
    );
  }

  return normalized;
}

function parseStatus(
  value:
    unknown
): AnalystTransactionStatus {
  const raw =
    queryValue(
      value
    );

  if (
    !raw ||
    raw.toLowerCase() ===
      "all"
  ) {
    return "all";
  }

  const normalized =
    raw.toUpperCase() as
      AnalystTransactionStatus;

  if (
    STATUSES.includes(
      normalized
    )
  ) {
    return normalized;
  }

  throw new AnalystTransactionFilterError(
    "Transaction status is invalid."
  );
}

function parseType(
  value:
    unknown
): AnalystTransactionType {
  const raw =
    queryValue(
      value
    );

  if (
    !raw ||
    raw.toLowerCase() ===
      "all"
  ) {
    return "all";
  }

  const normalized =
    raw.toUpperCase() as
      AnalystTransactionType;

  if (
    TYPES.includes(
      normalized
    )
  ) {
    return normalized;
  }

  throw new AnalystTransactionFilterError(
    "Transaction type is invalid."
  );
}

function parseRisk(
  value:
    unknown
): AnalystTransactionRisk {
  const raw =
    queryValue(
      value
    );

  if (
    !raw ||
    raw.toLowerCase() ===
      "all"
  ) {
    return "all";
  }

  const normalized =
    raw.toUpperCase() as
      AnalystTransactionRisk;

  if (
    RISKS.includes(
      normalized
    )
  ) {
    return normalized;
  }

  throw new AnalystTransactionFilterError(
    "Transaction risk level is invalid."
  );
}

/* =========================================================
   GET TRANSACTION ANALYTICS

   GET /api/analyst/transactions
========================================================= */

export async function getAnalystTransactionAnalyticsController(
  req:
    Request,
  res:
    Response
): Promise<void> {
  try {
    const data =
      await getAnalystTransactionAnalytics({
        range:
          parseRange(
            req.query.range
          ),

        currency:
          parseCurrency(
            req.query.currency
          ),

        status:
          parseStatus(
            req.query.status
          ),

        type:
          parseType(
            req.query.type
          ),

        risk:
          parseRisk(
            req.query.risk
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
      AnalystTransactionFilterError
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
      "ANALYST TRANSACTION ANALYTICS ERROR:",
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
        "Unable to load transaction analytics.",
    });
  }
}