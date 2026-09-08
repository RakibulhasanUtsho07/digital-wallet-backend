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
  "bkash";

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

export const mockBkashProvider:
  PaymentProvider = {
    provider: PROVIDER,

    /* =====================================================
       TRANSACTION ID
    ====================================================== */

    createTransactionId(): string {
      return (
        "BK-" +
        crypto
          .randomBytes(10)
          .toString("hex")
          .toUpperCase()
      );
    },

    /* =====================================================
       INITIATE PAYMENT
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
          `Demo bKash payment initialized for ${input.amount} BDT.`,
      };
    },

    /* =====================================================
       VERIFY PAYMENT
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
          "Demo bKash payment verified successfully.",
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
            "bKash account number is required.",
        };
      }

      /*
       * PaymentSource.accountLookup contains HMAC(account).
       */
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
            "bKash account not found.",
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
          ? "bKash account is valid."
          : "bKash account is not active.",
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
            "bKash account number is required.",
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
            "Invalid bKash debit amount.",
          status: "FAILED",
        };
      }

      /*
       * IMPORTANT:
       *
       * Do NOT modify PaymentSource here.
       *
       * paymentService.ts performs the actual atomic
       * source debit + wallet credit.
       */

      return {
        success: true,

        providerTransactionId:
          this.createTransactionId(),

        message:
          "Demo bKash debit authorized successfully.",

        status: "SUCCESS",
      };
    },
  };