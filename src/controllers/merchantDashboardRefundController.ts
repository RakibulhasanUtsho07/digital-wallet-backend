import mongoose from "mongoose";

import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  Merchant,
} from "../models/Merchant.js";

import {
  createMerchantRefund,
  MerchantRefundError,
} from "../services/merchantRefundService.js";

function readText(
  value: unknown
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function readIdempotencyKey(
  value: unknown
): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return typeof value[0] === "string"
      ? value[0].trim()
      : "";
  }

  return "";
}

export const createMerchantDashboardRefundController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const ownerId =
        req.user?._id;

      if (
        !ownerId ||
        !mongoose.isValidObjectId(ownerId)
      ) {
        res.status(401).json({
          success: false,
          message:
            "Authentication is required.",
        });

        return;
      }

      const merchant =
        await Merchant.findOne({
          ownerId:
            new mongoose.Types.ObjectId(
              ownerId
            ),
        })
          .select(
            "_id status verificationStatus testEnabled liveEnabled"
          )
          .lean();

      if (!merchant) {
        res.status(404).json({
          success: false,
          message:
            "Merchant account not found.",
        });

        return;
      }

      if (merchant.status !== "active") {
        res.status(403).json({
          success: false,
          message:
            "Merchant account is not active.",
        });

        return;
      }

      const body =
        req.body &&
        typeof req.body === "object"
          ? req.body as Record<string, unknown>
          : {};

      const paymentId =
        readText(body.paymentId);

      const mode =
        readText(body.mode)
          .toLowerCase();

      if (
        mode !== "test" &&
        mode !== "live"
      ) {
        res.status(400).json({
          success: false,
          message:
            'Refund mode must be either "test" or "live".',
        });

        return;
      }

      if (
        mode === "test" &&
        merchant.testEnabled !== true
      ) {
        res.status(403).json({
          success: false,
          message:
            "Test mode is disabled for this merchant.",
        });

        return;
      }

      if (
        mode === "live" &&
        merchant.liveEnabled !== true
      ) {
        res.status(403).json({
          success: false,
          message:
            "Live mode is disabled for this merchant.",
        });

        return;
      }

      if (
        mode === "live" &&
        merchant.verificationStatus !== "verified"
      ) {
        res.status(403).json({
          success: false,
          message:
            "Merchant verification is required for live refunds.",
        });

        return;
      }

      const idempotencyKey =
        readIdempotencyKey(
          req.headers["idempotency-key"]
        );

      const result =
        await createMerchantRefund({
          merchantId:
            merchant._id.toString(),

          environment:
            mode,

          paymentId,

          amount:
            body.amount,

          reason:
            body.reason,

          merchantReference:
            body.merchantReference,

          idempotencyKey,
        });

      res.status(
        result.duplicate
          ? 200
          : 201
      ).json({
        success: true,

        duplicate:
          result.duplicate,

        message:
          result.duplicate
            ? "Existing refund returned."
            : "Refund completed successfully.",

        refund:
          result.refund,
      });
    } catch (error: unknown) {
      if (
        error instanceof
        MerchantRefundError
      ) {
        res.status(
          error.statusCode
        ).json({
          success: false,
          code:
            error.code,
          message:
            error.message,
        });

        return;
      }

      console.error(
        "DASHBOARD REFUND ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to process refund.",
      });
    }
  };