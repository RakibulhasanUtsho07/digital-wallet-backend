import crypto from "node:crypto";

import {
  PaymentSource,
} from "./../../models/PaymentSource.js";

import {
  createLookupHash,
} from "../../utils/crypto.js";

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

/* =========================================================
   BANK PROVIDERS
========================================================= */

const BANKS: readonly PaymentProviderName[] = [
  "dbbl",
  "brac",
  "city",
  "ebl",
  "bankasia",
  "prime",
  "sonali",
];

/* =========================================================
   NORMALIZE
========================================================= */

const normalizeAccountNumber = (
  value: string
): string => {
  return value
    .trim()
    .replace(/\s+/g, "");
};

/* =========================================================
   CREATE BANK PROVIDER
========================================================= */

export const createMockBankProvider = (
  provider: PaymentProviderName
): PaymentProvider => {
  if (!BANKS.includes(provider)) {
    throw new Error(
      `Invalid mock bank provider: ${provider}`
    );
  }

  return {
    provider,

    /* ===================================================
       TRANSACTION ID
    ==================================================== */

    createTransactionId(): string {
      return (
        `${provider.toUpperCase()}-` +
        crypto
          .randomBytes(10)
          .toString("hex")
          .toUpperCase()
      );
    },

    /* ===================================================
       INITIATE
    ==================================================== */

    async initiatePayment(
      input: InitiatePaymentInput
    ): Promise<InitiatePaymentResult> {
      return {
        providerTransactionId:
          this.createTransactionId(),

        status: "PENDING",

        verificationRequired: false,

        message:
          `Demo ${provider} bank payment initialized for ${input.amount} BDT.`,
      };
    },

    /* ===================================================
       VERIFY
    ==================================================== */

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
          `Demo ${provider} payment verified successfully.`,
      };
    },

    /* ===================================================
       VALIDATE ACCOUNT
    ==================================================== */

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
            `${provider.toUpperCase()} account number is required.`,
        };
      }

      /*
       * PaymentSource.accountLookup =
       *
       * HMAC(accountNumber)
       */

      const accountLookup =
        createLookupHash(
          normalized
        );

      const account =
        await PaymentSource.findOne({
          provider,
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
            `${provider.toUpperCase()} bank account not found.`,
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
          ? `${provider.toUpperCase()} bank account is valid.`
          : `${provider.toUpperCase()} bank account is not active.`,
      };
    },

    /* ===================================================
       DEBIT
    ==================================================== */

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
            "Bank account number is required.",
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
            "Invalid bank debit amount.",
          status: "FAILED",
        };
      }

      /*
       * IMPORTANT:
       *
       * No PaymentSource mutation here.
       *
       * paymentService.ts performs atomic source
       * balance deduction + wallet credit.
       */

      return {
        success: true,

        providerTransactionId:
          this.createTransactionId(),

        message:
          `Demo ${provider} bank debit authorized successfully.`,

        status: "SUCCESS",
      };
    },
  };
};

/* =========================================================
   ALL BANK PROVIDERS
========================================================= */

export const bankProviders: PaymentProvider[] =
  BANKS.map(
    (provider) =>
      createMockBankProvider(
        provider
      )
  );