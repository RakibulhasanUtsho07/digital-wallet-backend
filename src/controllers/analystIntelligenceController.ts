import type {
  Request,
  Response,
} from "express";

import {
  getAnalystIntelligence,
} from "../services/analystIntelligenceService.js";

import {
  AnalystFilterError,
  parseAnalystFilters,
} from "../utils/analystFilters.js";

import type {
  AnalystInsightCategory,
  AnalystInsightSeverity,
  AnalystIntelligenceCategoryFilter,
  AnalystIntelligenceSeverityFilter,
} from "../types/analystTypes.js";

/* =========================================================
   CONSTANTS
========================================================= */

const ALLOWED_SEVERITIES =
  new Set<
    AnalystInsightSeverity
  >([
    "critical",
    "high",
    "medium",
    "info",
    "positive",
  ]);

const ALLOWED_CATEGORIES =
  new Set<
    AnalystInsightCategory
  >([
    "payments",
    "revenue",
    "refunds",
    "disputes",
    "risk",
    "growth",
    "data_quality",
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
    typeof input[
      0
    ] ===
      "string"
  ) {
    return input[
      0
    ].trim();
  }

  return "";
}

/* =========================================================
   SEVERITY FILTER
========================================================= */

function parseSeverity(
  input:
    unknown
): AnalystIntelligenceSeverityFilter {
  const value =
    queryValue(
      input
    ).toLowerCase();

  if (
    !value ||
    value ===
      "all"
  ) {
    return "all";
  }

  if (
    ALLOWED_SEVERITIES.has(
      value as
        AnalystInsightSeverity
    )
  ) {
    return value as
      AnalystInsightSeverity;
  }

  throw new AnalystFilterError(
    "severity must be one of: all, critical, high, medium, info, positive."
  );
}

/* =========================================================
   CATEGORY FILTER
========================================================= */

function parseCategory(
  input:
    unknown
): AnalystIntelligenceCategoryFilter {
  const value =
    queryValue(
      input
    ).toLowerCase();

  if (
    !value ||
    value ===
      "all"
  ) {
    return "all";
  }

  if (
    ALLOWED_CATEGORIES.has(
      value as
        AnalystInsightCategory
    )
  ) {
    return value as
      AnalystInsightCategory;
  }

  throw new AnalystFilterError(
    "category must be one of: all, payments, revenue, refunds, disputes, risk, growth, data_quality."
  );
}

/* =========================================================
   GET ANALYST INTELLIGENCE

   GET /api/analyst/intelligence
========================================================= */

export async function getAnalystIntelligenceController(
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

    const severity =
      parseSeverity(
        req.query
          .severity
      );

    const category =
      parseCategory(
        req.query
          .category
      );

    const data =
      await getAnalystIntelligence({
        filters,
        severity,
        category,
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
      "ANALYST INTELLIGENCE ERROR:",
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
        "Unable to load analyst intelligence.",
    });
  }
}