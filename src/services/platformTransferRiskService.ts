import type {
  ClientSession,
} from "mongoose";

import {
  Transaction,
} from "../models/Transaction.js";

import {
  User,
} from "../models/User.js";

import {
  decryptData,
} from "../utils/crypto.js";

import {
  getOrCreatePlatformSettings,
} from "./platformSettingsService.js";

const isEncryptedValue =
  (
    value: unknown
  ): value is {
    encrypted:
      string;

    iv:
      string;

    authTag:
      string;
  } => {
    if (
      !value ||
      typeof value !==
        "object"
    ) {
      return false;
    }

    const data =
      value as
        Record<
          string,
          unknown
        >;

    return (
      typeof data.encrypted ===
        "string" &&
      typeof data.iv ===
        "string" &&
      typeof data.authTag ===
        "string"
    );
  };

const getTransactionAmount =
  (
    transaction: {
      amountEncrypted?:
        unknown;

      amount?:
        unknown;
    }
  ): number => {
    if (
      isEncryptedValue(
        transaction
          .amountEncrypted
      )
    ) {
      const minorUnits =
        Number(
          decryptData(
            transaction
              .amountEncrypted
          )
        );

      if (
        Number.isSafeInteger(
          minorUnits
        ) &&
        minorUnits >= 0
      ) {
        return (
          minorUnits /
          100
        );
      }

      throw new Error(
        "Invalid encrypted transaction amount."
      );
    }

    /*
     * Temporary legacy fallback only.
     * Remove after plaintext amount cleanup everywhere.
     */
    const legacy =
      Number(
        transaction.amount
      );

    if (
      Number.isFinite(
        legacy
      ) &&
      legacy >= 0
    ) {
      return legacy;
    }

    throw new Error(
      "Transaction amount could not be evaluated."
    );
  };

const startOfUtcDay =
  (): Date => {
    const now =
      new Date();

    return new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        0,
        0,
        0
      )
    );
  };

export type TransferPolicyDecision =
  | {
      allowed: true;

      reviewRequired:
        boolean;

      riskScore:
        "LOW"
        | "MEDIUM"
        | "HIGH";

      dailyUsed:
        number;

      dailyRemaining:
        number;

      windowTransfers:
        number;
    }
  | {
      allowed: false;

      code:
        "DAILY_LIMIT_EXCEEDED"
        | "VELOCITY_LIMIT_EXCEEDED"
        | "KYC_REQUIRED"
        | "MANUAL_REVIEW_REQUIRED";

      message:
        string;
    };

export const evaluateTransferPolicy =
  async ({
    senderId,
    amount,
    session,
  }: {
    senderId:
      string;

    amount:
      number;

    session?:
      ClientSession;
  }): Promise<TransferPolicyDecision> => {
    if (
      !Number.isFinite(
        amount
      ) ||
      amount <= 0
    ) {
      return {
        allowed:
          false,

        code:
          "DAILY_LIMIT_EXCEEDED",

        message:
          "Invalid transfer amount.",
      };
    }

    const settings =
      await getOrCreatePlatformSettings(
        session
      );

    const now =
      new Date();

    const velocityStart =
      new Date(
        now.getTime() -
          settings.risk
            .velocityWindowMinutes *
            60 *
            1000
      );

    const dailyQuery =
      Transaction.find({
        senderId,

        type:
          "TRANSFER",

        status:
          "COMPLETED",

        createdAt: {
          $gte:
            startOfUtcDay(),

          $lte:
            now,
        },
      }).select(
        "amountEncrypted amount"
      );

    const velocityQuery =
      Transaction.countDocuments({
        senderId,

        type:
          "TRANSFER",

        status:
          "COMPLETED",

        createdAt: {
          $gte:
            velocityStart,

          $lte:
            now,
        },
      });

    if (session) {
      dailyQuery.session(
        session
      );

      velocityQuery.session(
        session
      );
    }

    const [
      dailyTransactions,
      windowTransfers,
    ] =
      await Promise.all([
        dailyQuery.lean(),
        velocityQuery,
      ]);

    const dailyUsed =
      dailyTransactions.reduce(
        (
          total,
          transaction
        ) =>
          total +
          getTransactionAmount(
            transaction
          ),
        0
      );

    if (
      dailyUsed +
        amount >
      settings.risk
        .dailyTransferLimit
    ) {
      return {
        allowed:
          false,

        code:
          "DAILY_LIMIT_EXCEEDED",

        message:
          "This transfer would exceed the configured daily transfer limit.",
      };
    }

    if (
      windowTransfers >=
      settings.risk
        .maxTransfersPerWindow
    ) {
      return {
        allowed:
          false,

        code:
          "VELOCITY_LIMIT_EXCEEDED",

        message:
          "Too many transfers were made in the configured velocity window.",
      };
    }

    const highValue =
      amount >=
      settings.risk
        .reviewThreshold;

    if (
      highValue &&
      settings.risk
        .requireKycForHighValue
    ) {
      const userQuery =
        User.findById(
          senderId
        ).select(
          "kycStatus"
        );

      if (session) {
        userQuery.session(
          session
        );
      }

      const user =
        await userQuery;

      if (
        !user ||
        user.kycStatus !==
          "verified"
      ) {
        return {
          allowed:
            false,

          code:
            "KYC_REQUIRED",

          message:
            "Verified KYC is required for this transfer.",
        };
      }
    }

    /*
     * Strong default: until a manual-review queue is
     * implemented, do not silently auto-complete transfers
     * above the configured review threshold.
     */
    if (highValue) {
      return {
        allowed:
          false,

        code:
          "MANUAL_REVIEW_REQUIRED",

        message:
          "This transfer requires manual review under the current platform policy.",
      };
    }

    const utilization =
      (
        dailyUsed +
        amount
      ) /
      Math.max(
        settings.risk
          .dailyTransferLimit,
        1
      );

    const riskScore =
      utilization >= 0.8 ||
      windowTransfers >=
        Math.max(
          settings.risk
            .maxTransfersPerWindow -
            2,
          1
        )
        ? "MEDIUM"
        : "LOW";

    return {
      allowed:
        true,

      reviewRequired:
        false,

      riskScore,

      dailyUsed,

      dailyRemaining:
        Math.max(
          settings.risk
            .dailyTransferLimit -
            dailyUsed -
            amount,
          0
        ),

      windowTransfers,
    };
  };
