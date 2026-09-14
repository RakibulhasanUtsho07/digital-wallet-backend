import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  getMerchantReport,
} from "../services/merchantReportService.js";

/* =========================================================
   GET MERCHANT REPORT
   GET /api/merchants/reports
========================================================= */

export async function getMerchantReportController(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const ownerId =
      req.user?._id;

    if (!ownerId) {
      res.status(401).json({
        success: false,

        message:
          "Authentication is required.",
      });

      return;
    }

    const result =
      await getMerchantReport({
        ownerId,

        reportType:
          req.query.reportType,

        from:
          req.query.from,

        to:
          req.query.to,

        status:
          req.query.status,

        provider:
          req.query.provider,

        sourceType:
          req.query.sourceType,

        payoutMethod:
          req.query.payoutMethod,

        currency:
          req.query.currency,

        mode:
          req.query.mode,
      });

    res.status(200).json({
      success: true,

      data: result,
    });
  } catch (
    error: unknown
  ) {
    console.error(
      "GET MERCHANT REPORT ERROR:",
      error
    );

    res.status(400).json({
      success: false,

      message:
        error instanceof Error
          ? error.message
          : "Unable to generate merchant report.",
    });
  }
}