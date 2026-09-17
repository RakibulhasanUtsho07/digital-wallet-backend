import crypto from "node:crypto";

import type {
  PaymentProvider,
  PaymentProviderName,
  InitiatePaymentInput,
  InitiatePaymentResult,
  VerifyPaymentInput,
  VerifyPaymentResult,
  ValidateAccountResult,
  DebitPaymentResult,
} from "../paymentProvider.js";

import {
  PaymentSource,
} from "../../../models/PaymentSource.js";

/* =========================================================
   HELPERS
========================================================= */

const normalizeAccountNumber = (
  value: string
): string => {
  return value
    .trim()
    .replace(/\s+/g, "");
};

/* =========================================================
   DEMO PROVIDER
========================================================= */

export class DemoPaymentProvider
  implements PaymentProvider
{
  readonly provider: PaymentProviderName;

  constructor(
    provider: PaymentProviderName
  ) {
    this.provider = provider;
  }

  /* =======================================================
     TRANSACTION ID
  ====================================================== */

  createTransactionId(): string {
    return (
      `DEMO-${this.provider.toUpperCase()}-` +
      crypto
        .randomBytes(10)
        .toString("hex")
        .toUpperCase()
    );
  }

  /* =======================================================
     INITIATE PAYMENT
  ====================================================== */

  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentResult> {
    return {
      providerTransactionId:
        this.createTransactionId(),

      status: "PENDING",

      verificationRequired: true,

      /*
       * Demo-only verification code.
       *
       * This is NOT used by the current add-money flow.
       */
      demoCode: String(
        crypto.randomInt(
          100000,
          1000000
        )
      ),

      message:
        `Demo ${input.sourceType} payment initialized successfully.`,
    };
  }

  /* =======================================================
     VERIFY PAYMENT
  ====================================================== */

  async verifyPayment(
    input: VerifyPaymentInput
  ): Promise<VerifyPaymentResult> {
    const code =
      input.verificationCode.trim();

    if (!/^\d{6}$/.test(code)) {
      return {
        success: false,

        status: "FAILED",

        message:
          "Verification code must contain exactly 6 digits.",
      };
    }

    /*
     * Demo adapter only.
     *
     * Real provider adapter will verify against the
     * actual provider API.
     */
    return {
      success: true,

      status: "SUCCESS",

      message:
        "Demo payment verified successfully.",
    };
  }

  /* =======================================================
     VALIDATE ACCOUNT
  ====================================================== */

  async validateAccount(
    accountNumber: string
  ): Promise<ValidateAccountResult> {
    const normalizedAccount =
      normalizeAccountNumber(
        accountNumber
      );

    if (!normalizedAccount) {
      return {
        exists: false,

        active: false,

        message:
          "Account number is required.",
      };
    }

    /*
     * PaymentSource stores demo provider accounts.
     *
     * This lookup is used by the adapter.
     *
     * The authoritative secure verification is performed
     * by paymentService.ts using HMAC account lookup and
     * secret-code verification.
     */
    const source =
      await PaymentSource.findOne({
        provider:
          this.provider,

        accountNumber:
          normalizedAccount,
      })
        .select(
          "accountNumber accountName balance status currency"
        )
        .lean();

    if (!source) {
      return {
        exists: false,

        active: false,

        message:
          "Source account does not exist.",
      };
    }

    const active =
      source.status === "ACTIVE";

    return {
      exists: true,

      active,

      availableBalance:
        Number(
          source.balance ?? 0
        ),

      accountName:
        source.accountName,

      currency: "BDT",

      message: active
        ? "Source account is valid."
        : "Source account is not active.",
    };
  }

  /* =======================================================
     DEBIT
  ====================================================== */

  async debit(
    accountNumber: string,
    amount: number,
    _reference?: string
  ): Promise<DebitPaymentResult> {
    const normalizedAccount =
      normalizeAccountNumber(
        accountNumber
      );

    if (!normalizedAccount) {
      return {
        success: false,

        providerTransactionId: "",

        message:
          "Account number is required.",

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
          "Invalid debit amount.",

        status: "FAILED",
      };
    }

    /*
     * IMPORTANT
     *
     * Demo provider does NOT modify PaymentSource.balance.
     *
     * paymentService.ts performs:
     *
     *   PaymentSource balance -
     *   Wallet balance +
     *
     * inside the SAME Mongo transaction.
     */
    return {
      success: true,

      providerTransactionId:
        this.createTransactionId(),

      message:
        `Demo ${this.provider} debit authorized successfully.`,

      status: "SUCCESS",
    };
  }
}

/* =========================================================
   TYPE GUARD
========================================================= */

export const isDemoProvider = (
  provider: PaymentProvider
): provider is DemoPaymentProvider => {
  return (
    provider instanceof
    DemoPaymentProvider
  );
};