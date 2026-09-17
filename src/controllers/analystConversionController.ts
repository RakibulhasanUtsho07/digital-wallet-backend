import type {
  Request,
  Response,
} from "express";

import type {
  PaymentSourceType,
} from "../models/Payment.js";

import {
  getAnalystConversionAnalytics,
  type AnalystConversionSource,
} from "../services/analystConversionService.js";

import {
  AnalystFilterError,
  parseAnalystFilters,
} from "../utils/analystFilters.js";

/* =========================================================
   SOURCES
========================================================= */

const SOURCES:
  Array<
    "all" |
    PaymentSourceType
  > = [
    "all",
    "wallet",
    "card",
    "paypal",
    "local_psp",
  ];

/* =========================================================
   HELPERS
========================================================= */

function queryValue(
  input: unknown
): string {
  return typeof input ===
    "string"
    ? input.trim()
    : "";
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
  input: unknown
): AnalystConversionSource {
  const raw =
    queryValue(
      input
    ).toLowerCase() ||
    "all";

  if (
    SOURCES.includes(
      raw as
        AnalystConversionSource
    )
  ) {
    return raw as
      AnalystConversionSource;
  }

  throw new AnalystFilterError(
    "source must be one of: all, wallet, card, paypal, local_psp."
  );
}

/* =========================================================
   CONTROLLER

   GET /api/analyst/conversion
========================================================= */

export async function getAnalystConversionAnalyticsController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const common =
      parseAnalystFilters(
        req.query
      );

    const data =
      await getAnalystConversionAnalytics({
        range:
          common.range,

        mode:
          common.mode,

        currency:
          common.currency,

        provider:
          parseProvider(
            req.query.provider
          ),

        source:
          parseSource(
            req.query.source
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
      "ANALYST CONVERSION ERROR:",
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
        "Unable to load payment conversion analytics.",
    });
  }
}