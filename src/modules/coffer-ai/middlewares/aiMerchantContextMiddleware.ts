import type {
  NextFunction,
  Request,
  Response,
} from "express";

import mongoose from "mongoose";

import {
  Merchant,
} from "../../../models/Merchant.js";

import type {
  AuthRequest,
} from "../../../middlewares/authMiddleware.js";

import type {
  TrustedMerchantPrincipal,
} from "../types/cofferAi.types.js";

/* =========================================================
   REQUEST CONTRACT
========================================================= */

type MerchantContextRequest =
  AuthRequest & {
    merchant?:
      TrustedMerchantPrincipal |
      null;
  };

interface MerchantContextRecord {
  _id?: unknown;
  status?: unknown;
  verificationStatus?: unknown;
  mode?: unknown;
  environment?: unknown;
  testEnabled?: unknown;
  liveEnabled?: unknown;
}

/* =========================================================
   SAFE HELPERS
========================================================= */

function safeIdentifier(
  value: unknown,
): string | null {
  if (
    typeof value ===
    "string"
  ) {
    const normalized =
      value.trim();

    return normalized
      ? normalized
      : null;
  }

  if (
    value &&
    typeof value ===
      "object" &&
    "toString" in value &&
    typeof value.toString ===
      "function"
  ) {
    const normalized =
      value.toString().trim();

    return normalized &&
      normalized !==
        "[object Object]"
      ? normalized
      : null;
  }

  return null;
}

function merchantEnvironment(
  merchant:
    MerchantContextRecord,
): unknown {
  if (
    merchant.environment !==
    undefined
  ) {
    return merchant.environment;
  }

  if (
    merchant.mode !==
    undefined
  ) {
    return merchant.mode;
  }

  if (
    merchant.liveEnabled ===
    true
  ) {
    return "live";
  }

  if (
    merchant.testEnabled ===
    true
  ) {
    return "test";
  }

  return "unknown";
}

/* =========================================================
   ATTACH TRUSTED MERCHANT CONTEXT

   `protect` runs before this middleware and loads the current user from
   MongoDB. The merchant is then resolved only by that trusted user ID.
   Request body/query merchantId or ownerId values are never read.
========================================================= */

export async function attachCofferAiMerchantContext(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const authenticated =
    request as MerchantContextRequest;

  if (
    authenticated.user?.role !==
    "merchant"
  ) {
    next();

    return;
  }

  const ownerId =
    safeIdentifier(
      authenticated.user._id,
    );

  if (
    !ownerId ||
    !mongoose.isValidObjectId(
      ownerId,
    )
  ) {
    response.status(401).json({
      success: false,
      message:
        "The authenticated merchant account could not be verified.",
      error: {
        code:
          "AI_MERCHANT_CONTEXT_INVALID",
      },
    });

    return;
  }

  try {
    const merchant =
      await Merchant.findOne({
        ownerId:
          new mongoose.Types.ObjectId(
            ownerId,
          ),
      })
        .select(
          [
            "_id",
            "status",
            "verificationStatus",
            "mode",
            "environment",
            "testEnabled",
            "liveEnabled",
          ].join(" "),
        )
        .sort({
          createdAt: -1,
        })
        .lean() as unknown as
        MerchantContextRecord |
        null;

    if (merchant) {
      const merchantId =
        safeIdentifier(
          merchant._id,
        );

      if (merchantId) {
        authenticated.merchant = {
          _id:
            merchantId,
          merchantId,
          status:
            merchant.status,
          verificationStatus:
            merchant.verificationStatus,
          environment:
            merchantEnvironment(
              merchant,
            ),
        };
      }
    }

    next();
  } catch (error) {
    console.error(
      "COFFER AI MERCHANT CONTEXT ERROR:",
      error instanceof Error
        ? error.message
        : error,
    );

    response.status(503).json({
      success: false,
      message:
        "Merchant context is temporarily unavailable.",
      error: {
        code:
          "AI_MERCHANT_CONTEXT_UNAVAILABLE",
      },
    });
  }
}
