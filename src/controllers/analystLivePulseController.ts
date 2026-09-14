import type {
  Request,
  Response,
} from "express";

import {
  getAnalystLivePulse,
  type AnalystPulseMode,
} from "../services/analystLivePulseService.js";

/* =========================================================
   FILTER HELPERS
========================================================= */

const ALLOWED_MODES:
  AnalystPulseMode[] = [
    "all",
    "test",
    "live",
  ];

function queryValue(
  input: unknown
): string {
  return typeof input === "string"
    ? input.trim()
    : "";
}

function parseMode(
  input: unknown
): AnalystPulseMode {
  const value =
    queryValue(
      input
    ).toLowerCase();

  if (!value) {
    return "all";
  }

  if (
    ALLOWED_MODES.includes(
      value as AnalystPulseMode
    )
  ) {
    return value as AnalystPulseMode;
  }

  throw new Error(
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
    throw new Error(
      "Currency must be a three-letter ISO code."
    );
  }

  return value;
}

function isFilterError(
  error: unknown
): error is Error {
  return (
    error instanceof Error &&
    (
      error.message.startsWith(
        "Mode must"
      ) ||
      error.message.startsWith(
        "Currency must"
      )
    )
  );
}

/* =========================================================
   LIVE PLATFORM PULSE

   GET /api/analyst/live-pulse
========================================================= */

export async function getAnalystLivePulseController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const data =
      await getAnalystLivePulse({
        mode:
          parseMode(
            req.query.mode
          ),
        currency:
          parseCurrency(
            req.query.currency
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

    res.status(200).json({
      success: true,
      data,
    });
  } catch (
    error: unknown
  ) {
    if (
      isFilterError(
        error
      )
    ) {
      res.status(400).json({
        success: false,
        message:
          error.message,
      });

      return;
    }

    console.error(
      "ANALYST LIVE PULSE ERROR:",
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
        "Unable to load the live platform pulse.",
    });
  }
}

