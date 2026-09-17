import type {
  Request,
} from "express";

import type {
  AnalystDateFilters,
  AnalystMode,
  AnalystRange,
} from "../types/analystTypes.js";

const RANGE_DURATION_MS: Record<
  AnalystRange,
  number
> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
};

const VALID_RANGES =
  new Set<AnalystRange>([
    "24h",
    "7d",
    "30d",
    "90d",
  ]);

const VALID_MODES =
  new Set<AnalystMode>([
    "all",
    "test",
    "live",
  ]);

export class AnalystFilterError
  extends Error {
  constructor(message: string) {
    super(message);
    this.name =
      "AnalystFilterError";
  }
}

function queryValue(
  input: unknown
): string {
  if (
    typeof input ===
    "string"
  ) {
    return input.trim();
  }

  if (
    Array.isArray(input) &&
    typeof input[0] ===
      "string"
  ) {
    return input[0].trim();
  }

  return "";
}

export function parseAnalystFilters(
  query: Request["query"]
): AnalystDateFilters {
  const rawRange =
    queryValue(query.range) ||
    "30d";

  if (
    !VALID_RANGES.has(
      rawRange as AnalystRange
    )
  ) {
    throw new AnalystFilterError(
      "range must be one of: 24h, 7d, 30d, 90d."
    );
  }

  const range =
    rawRange as AnalystRange;

  const rawMode =
    queryValue(query.mode) ||
    "all";

  if (
    !VALID_MODES.has(
      rawMode as AnalystMode
    )
  ) {
    throw new AnalystFilterError(
      "mode must be one of: all, test, live."
    );
  }

  const mode =
    rawMode as AnalystMode;

  const currency =
    (
      queryValue(
        query.currency
      ) || "BDT"
    ).toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      currency
    )
  ) {
    throw new AnalystFilterError(
      "currency must be a valid three-letter code."
    );
  }

  const to =
    new Date();

  const duration =
    RANGE_DURATION_MS[range];

  const from =
    new Date(
      to.getTime() -
        duration
    );

  const previousTo =
    new Date(
      from.getTime()
    );

  const previousFrom =
    new Date(
      previousTo.getTime() -
        duration
    );

  return {
    range,
    mode,
    currency,
    bucket:
      range === "24h"
        ? "hour"
        : "day",
    from,
    to,
    previousFrom,
    previousTo,
  };
}
