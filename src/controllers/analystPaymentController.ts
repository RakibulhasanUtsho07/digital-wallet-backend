import type {
  Request,
  Response,
} from "express";

import type {
  PaymentSourceType,
  PaymentStatus,
} from "../models/Payment.js";

import {
  getAnalystPaymentAnalytics,
  type AnalystPaymentMode,
  type AnalystPaymentRange,
} from "../services/analystPaymentService.js";

/* =========================================================
   FILTER CONSTANTS
========================================================= */

const ALLOWED_RANGES:
  AnalystPaymentRange[] = [
    "24h",
    "7d",
    "30d",
    "90d",
  ];

const ALLOWED_MODES:
  AnalystPaymentMode[] = [
    "all",
    "test",
    "live",
  ];

const ALLOWED_STATUSES: Array<
  "all" | PaymentStatus
> = [
  "all",
  "pending",
  "authorized",
  "captured",
  "completed",
  "failed",
  "cancelled",
  "expired",
];

const ALLOWED_SOURCES: Array<
  "all" | PaymentSourceType
> = [
  "all",
  "paypal",
  "card",
  "local_psp",
  "wallet",
];

/* =========================================================
   FILTER HELPERS
========================================================= */

class AnalystPaymentFilterError
  extends Error {}

function queryValue(
  input: unknown
): string {
  return typeof input === "string"
    ? input.trim()
    : "";
}

function parseRange(
  input: unknown
): AnalystPaymentRange {
  const value =
    queryValue(
      input
    ).toLowerCase() ||
    "30d";

  if (
    ALLOWED_RANGES.includes(
      value as AnalystPaymentRange
    )
  ) {
    return value as AnalystPaymentRange;
  }

  throw new AnalystPaymentFilterError(
    "Range must be 24h, 7d, 30d, or 90d."
  );
}

function parseMode(
  input: unknown
): AnalystPaymentMode {
  const value =
    queryValue(
      input
    ).toLowerCase() ||
    "all";

  if (
    ALLOWED_MODES.includes(
      value as AnalystPaymentMode
    )
  ) {
    return value as AnalystPaymentMode;
  }

  throw new AnalystPaymentFilterError(
    "Mode must be all, test, or live."
  );
}

function parseCurrency(
  input: unknown
): string {
  const value =
    queryValue(
      input
    ).toUpperCase() ||
    "BDT";

  if (
    !/^[A-Z]{3}$/.test(
      value
    )
  ) {
    throw new AnalystPaymentFilterError(
      "Currency must be a three-letter ISO code."
    );
  }

  return value;
}

function parseProvider(
  input: unknown
): string {
  const value =
    queryValue(
      input
    ).toLowerCase();

  if (!value) {
    return "";
  }

  if (
    value.length > 50 ||
    !/^[a-z0-9][a-z0-9_-]*$/.test(
      value
    )
  ) {
    throw new AnalystPaymentFilterError(
      "Provider contains invalid characters."
    );
  }

  return value;
}

function parseStatus(
  input: unknown
): "all" | PaymentStatus {
  const value =
    queryValue(
      input
    ).toLowerCase() ||
    "all";

  if (
    ALLOWED_STATUSES.includes(
      value as "all" | PaymentStatus
    )
  ) {
    return value as
      "all" | PaymentStatus;
  }

  throw new AnalystPaymentFilterError(
    "Payment status is invalid."
  );
}

function parseSource(
  input: unknown
): "all" | PaymentSourceType {
  const value =
    queryValue(
      input
    ).toLowerCase() ||
    "all";

  if (
    ALLOWED_SOURCES.includes(
      value as
        "all" | PaymentSourceType
    )
  ) {
    return value as
      "all" | PaymentSourceType;
  }

  throw new AnalystPaymentFilterError(
    "Payment source is invalid."
  );
}

/* =========================================================
   PAYMENT PERFORMANCE ANALYTICS

   GET /api/analyst/payments
========================================================= */

export async function getAnalystPaymentAnalyticsController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const data =
      await getAnalystPaymentAnalytics({
        range:
          parseRange(
            req.query.range
          ),
        mode:
          parseMode(
            req.query.mode
          ),
        currency:
          parseCurrency(
            req.query.currency
          ),
        provider:
          parseProvider(
            req.query.provider
          ),
        status:
          parseStatus(
            req.query.status
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

    res.status(200).json({
      success: true,
      data,
    });
  } catch (
    error: unknown
  ) {
    if (
      error instanceof
      AnalystPaymentFilterError
    ) {
      res.status(400).json({
        success: false,
        message:
          error.message,
      });

      return;
    }

    console.error(
      "ANALYST PAYMENT ANALYTICS ERROR:",
      error instanceof Error
        ? error.message
        : error
    );

    if (
      res.headersSent
    ) {
      return;
    }

    res.status(500).json({
      success: false,
      message:
        "Unable to load payment analytics.",
    });
  }
}
