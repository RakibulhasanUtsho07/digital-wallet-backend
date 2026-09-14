import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  getMerchantTransaction,
  listMerchantTransactions,
} from "../services/merchantTransactionService.js";

/* =========================================================
   HELPERS
========================================================= */

/**
 * Express req.query values can be:
 * string
 * ParsedQs
 * string[]
 * ParsedQs[]
 * undefined
 *
 * We only need a simple string value for our filters.
 */
function getSingleString(
  value: unknown
): string | undefined {
  if (
    typeof value ===
    "string"
  ) {
    return value;
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
      return first;
    }

    return undefined;
  }

  return undefined;
}

/**
 * Route params normally come as strings,
 * but keeping this helper unknown-safe avoids
 * TypeScript incompatibility.
 */
function getParamString(
  value: unknown
): string | undefined {
  if (
    typeof value ===
    "string"
  ) {
    return value;
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
      return first;
    }
  }

  return undefined;
}

/* =========================================================
   LIST
   GET /api/merchants/transactions
========================================================= */

export async function listMerchantTransactionsController(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    /* -------------------------------------------------------
       AUTHENTICATED OWNER
    ------------------------------------------------------- */

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

    /* -------------------------------------------------------
       QUERY VALUES
    ------------------------------------------------------- */

    const page =
      getSingleString(
        req.query.page
      );

    const limit =
      getSingleString(
        req.query.limit
      );

    const search =
      getSingleString(
        req.query.search
      );

    const status =
      getSingleString(
        req.query.status
      );

    const type =
      getSingleString(
        req.query.type
      );

    const currency =
      getSingleString(
        req.query.currency
      );

    const provider =
      getSingleString(
        req.query.provider
      );

    const mode =
      getSingleString(
        req.query.mode
      );

    const from =
      getSingleString(
        req.query.from
      );

    const to =
      getSingleString(
        req.query.to
      );

    /* -------------------------------------------------------
       SERVICE
    ------------------------------------------------------- */

    const result =
      await listMerchantTransactions({
        ownerId,

        page,

        limit,

        search,

        status,

        type,

        currency,

        provider,

        mode,

        from,

        to,
      });

    /* -------------------------------------------------------
       RESPONSE
    ------------------------------------------------------- */

    res.status(200).json({
      success: true,

      data: result,
    });
  } catch (
    error: unknown
  ) {
    console.error(
      "LIST MERCHANT TRANSACTIONS ERROR:",
      error
    );

    res.status(400).json({
      success: false,

      message:
        error instanceof Error
          ? error.message
          : "Unable to load merchant transactions.",
    });
  }
}

/* =========================================================
   DETAIL
   GET /api/merchants/transactions/:transactionId
========================================================= */

export async function getMerchantTransactionController(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    /* -------------------------------------------------------
       AUTHENTICATED OWNER
    ------------------------------------------------------- */

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

    /* -------------------------------------------------------
       TRANSACTION ID
    ------------------------------------------------------- */

    const transactionId =
      getParamString(
        req.params.transactionId
      );

    if (!transactionId) {
      res.status(400).json({
        success: false,

        message:
          "Transaction ID is required.",
      });

      return;
    }

    /* -------------------------------------------------------
       SERVICE
    ------------------------------------------------------- */

    const result =
      await getMerchantTransaction(
        ownerId,
        transactionId
      );

    /* -------------------------------------------------------
       RESPONSE
    ------------------------------------------------------- */

    res.status(200).json({
      success: true,

      data: result,
    });
  } catch (
    error: unknown
  ) {
    console.error(
      "GET MERCHANT TRANSACTION ERROR:",
      error
    );

    res.status(404).json({
      success: false,

      message:
        error instanceof Error
          ? error.message
          : "Merchant transaction not found.",
    });
  }
}