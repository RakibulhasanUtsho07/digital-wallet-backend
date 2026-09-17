import type {
  Request,
  Response,
} from "express";

import {
  getAnalystOverview,
} from "../services/analystOverviewService.js";

import {
  AnalystFilterError,
  parseAnalystFilters,
} from "../utils/analystFilters.js";

export async function getAnalystOverviewController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const filters =
      parseAnalystFilters(
        req.query
      );

    const data =
      await getAnalystOverview(
        filters
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
      AnalystFilterError
    ) {
      res.status(400).json({
        success: false,
        message:
          error.message,
      });

      return;
    }

    console.error(
      "ANALYST OVERVIEW ERROR:",
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
        "Unable to load analyst overview.",
    });
  }
}
