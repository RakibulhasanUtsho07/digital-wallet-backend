import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  getMerchantAnalytics,
} from "../services/merchantAnalyticsService.js";

/* =========================================================
   GET MERCHANT ANALYTICS

   GET /api/merchants/analytics
========================================================= */

export async function getMerchantAnalyticsController(
  req:
    AuthRequest,

  res:
    Response
): Promise<void> {
  try {
    /* =====================================================
       AUTHENTICATION
    ====================================================== */

    const ownerId =
      req.user?._id;

    if (
      !ownerId
    ) {
      res.status(
        401
      ).json({
        success:
          false,

        message:
          "Authentication is required.",
      });

      return;
    }

    /* =====================================================
       SERVICE
    ====================================================== */

    const result =
      await getMerchantAnalytics({
        ownerId:
          String(
            ownerId
          ),

        period:
          req.query.period,

        from:
          req.query.from,

        to:
          req.query.to,
      });

    /* =====================================================
       RESPONSE
    ====================================================== */

    res.status(
      200
    ).json({
      success:
        true,

      data:
        result,
    });
  } catch (
    error:
      unknown
  ) {
    console.error(
      "GET MERCHANT ANALYTICS ERROR:",
      error
    );

    const message =
      error instanceof
        Error
        ? error.message
        : "Unable to load merchant analytics.";

    let statusCode =
      400;

    if (
      message ===
      "Authenticated merchant owner is required."
    ) {
      statusCode =
        401;
    } else if (
      message ===
        "Merchant account not found."
    ) {
      statusCode =
        404;
    } else if (
      message ===
        "Merchant account is not active."
    ) {
      statusCode =
        403;
    }

    res.status(
      statusCode
    ).json({
      success:
        false,

      message,
    });
  }
}