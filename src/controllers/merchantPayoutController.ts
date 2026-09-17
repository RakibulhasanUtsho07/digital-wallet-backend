import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  createMerchantPayout,
  getMerchantPayout,
  listMerchantPayouts,
} from "../services/merchantPayoutService.js";

/* =========================================================
   HELPERS
========================================================= */

/*
 * Express can expose some request values as:
 *
 * string
 * string[]
 * undefined
 *
 * For fields where our service expects a single string,
 * normalize them safely.
 */
function getSingleString(
  value:
    | string
    | string[]
    | undefined
): string | undefined {
  if (
    typeof value ===
    "string"
  ) {
    return value.trim();
  }

  if (
    Array.isArray(value)
  ) {
    const first =
      value[0];

    if (
      typeof first ===
      "string"
    ) {
      return first.trim();
    }
  }

  return undefined;
}

/* =========================================================
   CREATE PAYOUT REQUEST
   POST /api/merchants/payouts
========================================================= */

export async function createMerchantPayoutController(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    /* =====================================================
       AUTHENTICATION
    ====================================================== */

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

    /* =====================================================
       IDEMPOTENCY KEY
    ====================================================== */

    const idempotencyHeader =
      getSingleString(
        req.headers[
          "idempotency-key"
        ]
      );

    const bodyIdempotencyKey =
      getSingleString(
        req.body?.idempotencyKey
      );

    const idempotencyKey =
      idempotencyHeader ||
      bodyIdempotencyKey;

    /* =====================================================
       CREATE PAYOUT
    ====================================================== */

    const result =
      await createMerchantPayout({
        ownerId,

        amount:
          req.body?.amount,

        currency:
          req.body?.currency,

        payoutMethod:
          req.body?.payoutMethod,

        destination:
          req.body?.destination,

        destinationReference:
          req.body
            ?.destinationReference,

        merchantReference:
          req.body
            ?.merchantReference,

        idempotencyKey,
      });

    /* =====================================================
       RESPONSE
    ====================================================== */

    res.status(
      result.duplicate
        ? 200
        : 201
    ).json({
      success: true,
      data: result,
    });
  } catch (
    error: unknown
  ) {
    console.error(
      "CREATE MERCHANT PAYOUT ERROR:",
      error
    );

    res.status(400).json({
      success: false,

      message:
        error instanceof Error
          ? error.message
          : "Unable to create payout request.",
    });
  }
}

/* =========================================================
   LIST PAYOUTS
   GET /api/merchants/payouts
========================================================= */

export async function listMerchantPayoutsController(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    /* =====================================================
       AUTHENTICATION
    ====================================================== */

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

    /* =====================================================
       LIST PAYOUTS
    ====================================================== */

    const result =
      await listMerchantPayouts({
        ownerId,

        page:
          req.query.page,

        limit:
          req.query.limit,

        search:
          req.query.search,

        status:
          req.query.status,

        payoutMethod:
          req.query.payoutMethod,

        from:
          req.query.from,

        to:
          req.query.to,
      });

    /* =====================================================
       RESPONSE
    ====================================================== */

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (
    error: unknown
  ) {
    console.error(
      "LIST MERCHANT PAYOUTS ERROR:",
      error
    );

    res.status(400).json({
      success: false,

      message:
        error instanceof Error
          ? error.message
          : "Unable to load merchant payouts.",
    });
  }
}

/* =========================================================
   GET PAYOUT DETAIL
   GET /api/merchants/payouts/:payoutId
========================================================= */

export async function getMerchantPayoutController(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    /* =====================================================
       AUTHENTICATION
    ====================================================== */

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

    /* =====================================================
       PAYOUT ID
    ====================================================== */

    const payoutId =
      getSingleString(
        req.params
          .payoutId
      );

    if (!payoutId) {
      res.status(400).json({
        success: false,
        message:
          "Payout ID is required.",
      });

      return;
    }

    /* =====================================================
       GET PAYOUT
    ====================================================== */

    const result =
      await getMerchantPayout(
        ownerId,
        payoutId
      );

    /* =====================================================
       RESPONSE
    ====================================================== */

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (
    error: unknown
  ) {
    console.error(
      "GET MERCHANT PAYOUT ERROR:",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : "Unable to load payout.";

    const statusCode =
      message ===
      "Payout not found."
        ? 404
        : 400;

    res.status(
      statusCode
    ).json({
      success: false,
      message,
    });
  }
}