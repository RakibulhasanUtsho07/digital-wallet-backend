import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  getMerchantTransaction,
  listMerchantTransactions,
  MerchantTransactionError,
} from "../services/merchantTransactionService.js";

/* =========================================================
   HELPERS
========================================================= */

function getSingleString(
  value:
    unknown
): string | undefined {
  if (
    typeof value ===
    "string"
  ) {
    const normalized =
      value.trim();

    return normalized ||
      undefined;
  }

  if (
    Array.isArray(
      value
    )
  ) {
    const first =
      value[0];

    if (
      typeof first ===
      "string"
    ) {
      const normalized =
        first.trim();

      return normalized ||
        undefined;
    }
  }

  return undefined;
}

function handleMerchantTransactionError(
  error:
    unknown,

  res:
    Response
): void {
  if (
    error instanceof
    MerchantTransactionError
  ) {
    res.status(
      error.statusCode
    ).json({
      success:
        false,

      code:
        error.code,

      message:
        error.message,
    });

    return;
  }

  console.error(
    "MERCHANT TRANSACTION ERROR:",

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
      "Unable to process merchant transaction request.",
  });
}

/* =========================================================
   LIST
   GET /api/merchants/transactions

   Supported query parameters:

   page
   limit
   search
   type
   direction
   status
   currency
   from
   to

   Example:

   /api/merchants/transactions
     ?type=REFUND
     &direction=DEBIT
     &currency=BDT
========================================================= */

export async function listMerchantTransactionsController(
  req:
    AuthRequest,

  res:
    Response
): Promise<void> {
  try {
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

    const result =
      await listMerchantTransactions({
        ownerId,

        page:
          getSingleString(
            req.query.page
          ),

        limit:
          getSingleString(
            req.query.limit
          ),

        search:
          getSingleString(
            req.query.search
          ),

        type:
          getSingleString(
            req.query.type
          ),

        direction:
          getSingleString(
            req.query.direction
          ),

        status:
          getSingleString(
            req.query.status
          ),

        currency:
          getSingleString(
            req.query.currency
          ),

        from:
          getSingleString(
            req.query.from
          ),

        to:
          getSingleString(
            req.query.to
          ),
      });

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
    handleMerchantTransactionError(
      error,
      res
    );
  }
}

/* =========================================================
   DETAIL
   GET /api/merchants/transactions/:transactionId
========================================================= */

export async function getMerchantTransactionController(
  req:
    AuthRequest,

  res:
    Response
): Promise<void> {
  try {
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

    const transactionId =
      getSingleString(
        req.params.transactionId
      );

    if (
      !transactionId
    ) {
      res.status(
        400
      ).json({
        success:
          false,

        message:
          "Transaction ID is required.",
      });

      return;
    }

    const result =
      await getMerchantTransaction(
        ownerId,
        transactionId
      );

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
    handleMerchantTransactionError(
      error,
      res
    );
  }
}