import mongoose from "mongoose";

import {
  PaymentIntent,
} from "../../models/PaymentIntent.js";

import {
  PaymentSource,
} from "../../models/PaymentSource.js";

import {
  Wallet,
} from "../../models/Wallet.js";

import {
  validateAddMoneyAmount,
} from "../../utils/paymentLimits.js";

import {
  createLookupHash,
  hashSecretCode,
  safeEqualHex,
} from "../../utils/crypto.js";

import {
  getPaymentProvider,
} from "./paymentProviderRegistry.js";

/* =========================================================
   PROVIDERS
========================================================= */

export const PAYMENT_PROVIDERS = [
  "bkash",
  "nagad",
  "rocket",
  "upay",
  "dbbl",
  "brac",
  "city",
  "ebl",
  "bankasia",
  "prime",
  "sonali",
] as const;

export type ProviderName =
  (typeof PAYMENT_PROVIDERS)[number];

/* =========================================================
   CONSTANTS
========================================================= */

const MIN_ACCOUNT_LENGTH = 8;

const MAX_ACCOUNT_LENGTH = 32;

const MIN_IDEMPOTENCY_LENGTH = 16;

const MAX_IDEMPOTENCY_LENGTH = 200;

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

const normalizeSecretCode = (
  value: string
): string => {
  return value.trim();
};

const isProviderName = (
  value: string
): value is ProviderName => {
  return (
    (
      PAYMENT_PROVIDERS as readonly string[]
    ).includes(value)
  );
};

/* =========================================================
   VERIFY PAYMENT SOURCE
========================================================= */

/*
 * Authoritative backend source-account verification.
 *
 * Checks:
 *
 * 1. Provider valid
 * 2. Account number valid
 * 3. HMAC account lookup
 * 4. Source exists
 * 5. Source active
 * 6. Secret code matches
 *
 * Frontend verification is NEVER trusted.
 */

export const verifyPaymentSource =
  async ({
    providerName,
    accountNumber,
    secretCode,
    session,
  }: {
    providerName: string;
    accountNumber: string;
    secretCode: string;
    session?: mongoose.ClientSession;
  }) => {
    /* =====================================================
       PROVIDER
    ====================================================== */

    if (
      !isProviderName(
        providerName
      )
    ) {
      throw new Error(
        "Unsupported payment provider."
      );
    }

    /* =====================================================
       NORMALIZE
    ====================================================== */

    const normalizedAccount =
      normalizeAccountNumber(
        accountNumber
      );

    const normalizedSecret =
      normalizeSecretCode(
        secretCode
      );

    /* =====================================================
       VALIDATE ACCOUNT
    ====================================================== */

    if (
      normalizedAccount.length <
        MIN_ACCOUNT_LENGTH ||
      normalizedAccount.length >
        MAX_ACCOUNT_LENGTH
    ) {
      throw new Error(
        "Invalid source account number."
      );
    }

    /* =====================================================
       VALIDATE SECRET
    ====================================================== */

    if (!normalizedSecret) {
      throw new Error(
        "Source account secret code is required."
      );
    }

    /* =====================================================
       HMAC LOOKUP
    ====================================================== */

    const accountLookup =
      createLookupHash(
        normalizedAccount
      );

    let query =
      PaymentSource.findOne({
        provider:
          providerName,

        accountLookup,
      }).select(
        "+secretCodeHash"
      );

    if (session) {
      query =
        query.session(
          session
        );
    }

    const source =
      await query;

    /* =====================================================
       ACCOUNT EXISTS
    ====================================================== */

    if (!source) {
      throw new Error(
        "No account was found for the selected provider."
      );
    }

    /* =====================================================
       STATUS
    ====================================================== */

    if (
      source.status !==
      "ACTIVE"
    ) {
      throw new Error(
        "Source payment account is not active."
      );
    }

    /* =====================================================
       SECRET HASH
    ====================================================== */

    const incomingHash =
      hashSecretCode(
        normalizedSecret
      );

    const storedHash =
      source.get(
        "secretCodeHash"
      ) as string | undefined;

    if (!storedHash) {
      throw new Error(
        "Source account authentication data is unavailable."
      );
    }

    /* =====================================================
       SAFE COMPARE
    ====================================================== */

    const matched =
      safeEqualHex(
        incomingHash,
        storedHash
      );

    if (!matched) {
      throw new Error(
        "The source account verification code is incorrect."
      );
    }

    return source;
  };

/* =========================================================
   CREATE ADD MONEY
========================================================= */

export const createAddMoney =
  async ({
    userId,
    providerName,
    accountNumber,
    secretCode,
    amount,
    reference,
    idempotencyKey,
  }: {
    userId: string;

    providerName: string;

    accountNumber: string;

    secretCode: string;

    amount: number;

    reference?: string;

    idempotencyKey: string;
  }) => {
    /* =====================================================
       AMOUNT
    ====================================================== */

    const amountError =
      validateAddMoneyAmount(
        amount
      );

    if (amountError) {
      throw new Error(
        amountError
      );
    }

    /* =====================================================
       IDEMPOTENCY
    ====================================================== */

    if (
      !idempotencyKey ||
      idempotencyKey.length <
        MIN_IDEMPOTENCY_LENGTH ||
      idempotencyKey.length >
        MAX_IDEMPOTENCY_LENGTH
    ) {
      throw new Error(
        "A valid idempotency key is required."
      );
    }

    /* =====================================================
       PROVIDER
    ====================================================== */

    if (
      !isProviderName(
        providerName
      )
    ) {
      throw new Error(
        "Unsupported payment provider."
      );
    }

    /* =====================================================
       ACCOUNT
    ====================================================== */

    const normalizedAccount =
      normalizeAccountNumber(
        accountNumber
      );

    if (
      normalizedAccount.length <
        MIN_ACCOUNT_LENGTH ||
      normalizedAccount.length >
        MAX_ACCOUNT_LENGTH
    ) {
      throw new Error(
        "Invalid source account number."
      );
    }

    /* =====================================================
       SECRET
    ====================================================== */

    const normalizedSecret =
      normalizeSecretCode(
        secretCode
      );

    if (!normalizedSecret) {
      throw new Error(
        "Source account secret code is required."
      );
    }

    /* =====================================================
       FIRST IDEMPOTENCY CHECK
    ====================================================== */

    const existing =
      await PaymentIntent.findOne({
        userId,

        idempotencyKey,
      });

    if (existing) {
      const existingWallet =
        existing.walletId
          ? await Wallet.findById(
              existing.walletId
            ).lean()
          : null;

      return {
        duplicate: true,

        intent: existing,

        wallet: existingWallet,

        providerTransactionId:
          existing.providerTransactionId ??
          null,
      };
    }

    /* =====================================================
       PROVIDER
    ====================================================== */

    const paymentProvider =
      getPaymentProvider(
        providerName
      );

    if (!paymentProvider) {
      throw new Error(
        "Payment provider is unavailable."
      );
    }

    /* =====================================================
       MONGO SESSION
    ====================================================== */

    const mongoSession =
      await mongoose.startSession();

    try {
      mongoSession.startTransaction();

      /* ===================================================
         WALLET
      ================================================== */

      const wallet =
        await Wallet.findOne({
          userId,
        }).session(
          mongoSession
        );

      if (!wallet) {
        throw new Error(
          "Wallet not found."
        );
      }

      if (
        wallet.status !==
        "ACTIVE"
      ) {
        throw new Error(
          "Wallet is not active."
        );
      }

      /* ===================================================
         SOURCE VERIFICATION
      ================================================== */

      const source =
        await verifyPaymentSource({
          providerName,

          accountNumber:
            normalizedAccount,

          secretCode:
            normalizedSecret,

          session:
            mongoSession,
        });

      /* ===================================================
         SOURCE BALANCE
      ================================================== */

      const sourceBalance =
        Number(
          source.balance ?? 0
        );

      if (
        sourceBalance <
        amount
      ) {
        throw new Error(
          `Insufficient source-account balance. Available ৳${sourceBalance.toLocaleString(
            "en-BD"
          )}.`
        );
      }

      /* ===================================================
         CREATE PAYMENT INTENT
      ================================================== */

      let intent;

      try {
        const documents =
          await PaymentIntent.create(
            [
              {
                userId,

                walletId:
                  wallet._id,

                provider:
                  providerName,

                sourceAccount:
                  normalizedAccount,

                amount,

                currency:
                  "BDT",

                reference,

                idempotencyKey,

                status:
                  "PROCESSING",
              },
            ],
            {
              session:
                mongoSession,
            }
          );

        intent =
          documents[0];
      } catch (error) {
        /*
         * Handles race conditions when a second request
         * attempts to use the same idempotency key.
         */

        const duplicate =
          await PaymentIntent.findOne({
            userId,

            idempotencyKey,
          }).session(
            mongoSession
          );

        if (
          duplicate
        ) {
          const duplicateWallet =
            duplicate.walletId
              ? await Wallet.findById(
                  duplicate.walletId
                )
                  .session(
                    mongoSession
                  )
                  .lean()
              : null;

          /*
           * The intent existed before our request.
           * The surrounding transaction did not make any
           * actual money mutation yet.
           */
          await mongoSession.commitTransaction();

          return {
            duplicate: true,

            intent:
              duplicate,

            wallet:
              duplicateWallet,

            providerTransactionId:
              duplicate.providerTransactionId ??
              null,
          };
        }

        throw error;
      }

      /* ===================================================
         PROVIDER TRANSACTION ID
      ================================================== */

      /*
       * Every provider adapter MUST implement
       * createTransactionId().
       *
       * This fixes:
       *
       * paymentProvider.createTransactionId is not a function
       */

      const providerTransactionId =
        paymentProvider.createTransactionId();

      /* ===================================================
         PROVIDER DEBIT AUTHORIZATION
      ================================================== */

      const debitResult =
        await paymentProvider.debit(
          normalizedAccount,
          amount,
          reference
        );

      if (
        !debitResult.success
      ) {
        intent.status =
          "FAILED";

        throw new Error(
          debitResult.message ||
            "Provider debit failed."
        );
      }

      /*
       * If provider returns its own transaction ID,
       * use it. Otherwise use our generated demo ID.
       */
      const finalProviderTransactionId =
        debitResult.providerTransactionId ||
        providerTransactionId;

      /* ===================================================
         SOURCE BALANCE DEBIT
      ================================================== */

      /*
       * IMPORTANT:
       *
       * This is the actual DEMO source-account ledger
       * mutation.
       *
       * Condition:
       *
       * balance >= amount
       *
       * protects against concurrent overspending.
       */

      const updatedSource =
        await PaymentSource.findOneAndUpdate(
          {
            _id:
              source._id,

            provider:
              providerName,

            accountLookup:
              createLookupHash(
                normalizedAccount
              ),

            status:
              "ACTIVE",

            balance: {
              $gte:
                amount,
            },
          },
          {
            $inc: {
              balance:
                -amount,
            },
          },
          {
            new: true,

            session:
              mongoSession,
          }
        ).lean();

      if (!updatedSource) {
        throw new Error(
          "Source account balance changed or is insufficient. Please retry."
        );
      }

      /* ===================================================
         WALLET CREDIT
      ================================================== */

      const updatedWallet =
        await Wallet.findOneAndUpdate(
          {
            _id:
              wallet._id,

            status:
              "ACTIVE",
          },
          {
            $inc: {
              balance:
                amount,
            },
          },
          {
            new: true,

            session:
              mongoSession,
          }
        ).lean();

      if (!updatedWallet) {
        throw new Error(
          "Wallet could not be credited."
        );
      }

      /* ===================================================
         COMPLETE INTENT
      ================================================== */

      intent.providerTransactionId =
        finalProviderTransactionId;

      intent.status =
        "SUCCESS";

      await intent.save({
        session:
          mongoSession,
      });

      /* ===================================================
         COMMIT
      ================================================== */

      await mongoSession.commitTransaction();

      /* ===================================================
         RESULT
      ================================================== */

      return {
        duplicate: false,

        intent,

        wallet:
          updatedWallet,

        providerTransactionId:
          finalProviderTransactionId,
      };
    } catch (error) {
      /* ===================================================
         ABORT
      ================================================== */

      if (
        mongoSession.inTransaction()
      ) {
        await mongoSession.abortTransaction();
      }

      throw error;
    } finally {
      await mongoSession.endSession();
    }
  };