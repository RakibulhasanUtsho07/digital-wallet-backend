import crypto from "node:crypto";

import {
  PaymentSource,
} from "./../../models/PaymentSource.js";


import type {
  PaymentProvider,
  PaymentProviderName,
  InitiatePaymentInput,
  InitiatePaymentResult,
  VerifyPaymentInput,
  VerifyPaymentResult,
  ValidateAccountResult,
  DebitPaymentResult,
} from "./paymentProvider.js";
import { createLookupHash } from "../../utils/crypto.js";

/* =========================================================
   PROVIDER
========================================================= */

const PROVIDER: PaymentProviderName =
  "nagad";

/* =========================================================
   NORMALIZE ACCOUNT
========================================================= */

const normalizeAccountNumber = (
  value: string
): string => {
  return value
    .trim()
    .replace(/\s+/g, "");
};

/* =========================================================
   PROVIDER
========================================================= */

export const mockNagadProvider:
  PaymentProvider = {
    provider: PROVIDER,

    /* =====================================================
       TRANSACTION ID
    ====================================================== */

    createTransactionId(): string {
      return (
        "NG-" +
        crypto
          .randomBytes(10)
          .toString("hex")
          .toUpperCase()
      );
    },

    /* =====================================================
       INITIATE
    ====================================================== */

    async initiatePayment(
      input: InitiatePaymentInput
    ): Promise<InitiatePaymentResult> {
      return {
        providerTransactionId:
          this.createTransactionId(),

        status: "PENDING",

        verificationRequired: false,

        message:
          `Demo Nagad payment initialized for ${input.amount} BDT.`,
      };
    },

    /* =====================================================
       VERIFY
    ====================================================== */

    async verifyPayment(
      input: VerifyPaymentInput
    ): Promise<VerifyPaymentResult> {
      const code =
        input.verificationCode.trim();

      if (!code) {
        return {
          success: false,
          status: "FAILED",
          message:
            "Verification code is required.",
        };
      }

      return {
        success: true,
        status: "SUCCESS",
        message:
          "Demo Nagad payment verified successfully.",
      };
    },

    /* =====================================================
       VALIDATE ACCOUNT
    ====================================================== */

    async validateAccount(
      accountNumber: string
    ): Promise<ValidateAccountResult> {
      const normalized =
        normalizeAccountNumber(
          accountNumber
        );

      if (!normalized) {
        return {
          exists: false,
          active: false,
          message:
            "Nagad account number is required.",
        };
      }

      const accountLookup =
        createLookupHash(
          normalized
        );

      const account =
        await PaymentSource.findOne({
          provider: PROVIDER,
          accountLookup,
        })
          .select(
            "accountNumber accountName balance status currency"
          )
          .lean();

      if (!account) {
        return {
          exists: false,
          active: false,
          message:
            "Nagad account not found.",
        };
      }

      const active =
        account.status ===
        "ACTIVE";

      return {
        exists: true,
        active,
        availableBalance:
          Number(
            account.balance ?? 0
          ),
        accountName:
          account.accountName,
        currency: "BDT",
        message: active
          ? "Nagad account is valid."
          : "Nagad account is not active.",
      };
    },

    /* =====================================================
       DEBIT
    ====================================================== */

    async debit(
      accountNumber: string,
      amount: number,
      _reference?: string
    ): Promise<DebitPaymentResult> {
      const normalized =
        normalizeAccountNumber(
          accountNumber
        );

      if (!normalized) {
        return {
          success: false,
          providerTransactionId: "",
          message:
            "Nagad account number is required.",
          status: "FAILED",
        };
      }

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return {
          success: false,
          providerTransactionId: "",
          message:
            "Invalid Nagad debit amount.",
          status: "FAILED",
        };
      }

      return {
        success: true,

        providerTransactionId:
          this.createTransactionId(),

        message:
          "Demo Nagad debit authorized successfully.",

        status: "SUCCESS",
      };
    },
  };