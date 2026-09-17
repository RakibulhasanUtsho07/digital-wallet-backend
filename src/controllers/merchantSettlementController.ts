import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  createMerchantSettlement,
  getMerchantSettlement,
  listMerchantSettlements,
} from "../services/merchantSettlementService.js";

/* =========================================================
   TYPES
========================================================= */

type MerchantSettlementCreateResult = {
  duplicate?: boolean;
  [key: string]: unknown;
};

/* =========================================================
   HELPER
========================================================= */

function getSingleString(
  value: unknown
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
   CREATE SETTLEMENT
   POST /api/merchants/settlements
========================================================= */

export async function createMerchantSettlementController(
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
      (await createMerchantSettlement({
        ownerId:
          String(ownerId),

        periodStart:
          req.body?.periodStart,

        periodEnd:
          req.body?.periodEnd,

        currency:
          req.body?.currency,

        note:
          req.body?.note,
      })) as unknown as MerchantSettlementCreateResult;

    const isDuplicate =
      result?.duplicate === true;

    res.status(
      isDuplicate
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
      "CREATE MERCHANT SETTLEMENT ERROR:",
      error
    );

    res.status(400).json({
      success: false,

      message:
        error instanceof Error
          ? error.message
          : "Unable to create settlement.",
    });
  }
}

/* =========================================================
   LIST SETTLEMENTS
   GET /api/merchants/settlements
========================================================= */

export async function listMerchantSettlementsController(
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
      await listMerchantSettlements({
        ownerId:
          String(ownerId),

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

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (
    error: unknown
  ) {
    console.error(
      "LIST MERCHANT SETTLEMENTS ERROR:",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : "Unable to load settlements.";

    res.status(400).json({
      success: false,
      message,
    });
  }
}

/* =========================================================
   GET SETTLEMENT DETAIL
   GET /api/merchants/settlements/:settlementId
========================================================= */

export async function getMerchantSettlementController(
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

    const settlementId =
      getSingleString(
        req.params?.settlementId
      );

    if (!settlementId) {
      res.status(400).json({
        success: false,

        message:
          "Settlement ID is required.",
      });

      return;
    }

    const result =
      await getMerchantSettlement(
        String(ownerId),
        settlementId
      );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (
    error: unknown
  ) {
    console.error(
      "GET MERCHANT SETTLEMENT ERROR:",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : "Unable to load settlement.";

    const statusCode =
      message ===
      "Settlement not found."
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