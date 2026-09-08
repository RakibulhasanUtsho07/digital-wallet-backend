import crypto from "node:crypto";

import {
  PaymentSource,
} from "./../../models/PaymentSource.js";



import type {
  PaymentProvider,
  InitiatePaymentInput,
  InitiatePaymentResult,
  VerifyPaymentInput,
  VerifyPaymentResult,
  ValidateAccountResult,
  DebitPaymentResult,
} from "./paymentProvider.js";
import { createLookupHash } from "../../utils/crypto.js";

const PROVIDER =
  "upay" as const;

const normalizeAccountNumber = (
  value: string
): string => {
  return value
    .trim()
    .replace(/\s+/g, "");
};

export const mockUpayProvider:
  PaymentProvider = {
    provider: PROVIDER,

    createTransactionId(): string {
      return (
        "UP-" +
        crypto
          .randomBytes(10)
          .toString("hex")
          .toUpperCase()
      );
    },

    async initiatePayment(
      input: InitiatePaymentInput
    ): Promise<InitiatePaymentResult> {
      return {
        providerTransactionId:
          this.createTransactionId(),

        status: "PENDING",

        verificationRequired: false,

        message:
          `Demo upay payment initialized for ${input.amount} BDT.`,
      };
    },

    async verifyPayment(
      input: VerifyPaymentInput
    ): Promise<VerifyPaymentResult> {
      if (
        !input.verificationCode.trim()
      ) {
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
          "Demo upay payment verified successfully.",
      };
    },

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
            "upay account number is required.",
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
            "upay account not found.",
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
          ? "upay account is valid."
          : "upay account is not active.",
      };
    },

    async debit(
      accountNumber: string,
      amount: number,
      _reference?: string
    ): Promise<DebitPaymentResult> {
      if (
        !normalizeAccountNumber(
          accountNumber
        )
      ) {
        return {
          success: false,
          providerTransactionId: "",
          message:
            "upay account number is required.",
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
            "Invalid upay debit amount.",
          status: "FAILED",
        };
      }

      return {
        success: true,

        providerTransactionId:
          this.createTransactionId(),

        message:
          "Demo upay debit authorized successfully.",

        status: "SUCCESS",
      };
    },
  };