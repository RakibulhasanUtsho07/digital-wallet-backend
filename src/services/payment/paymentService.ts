import mongoose from "mongoose";

import {
  PaymentIntent,
} from "../../models/PaymentIntent.js";

import {
  AddMoneyTransaction,
} from "../../models/AddMoneyTransaction.js";

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
   TYPES
========================================================= */

export interface AddMoneyInput {
  userId: string;

  providerName: string;

  accountNumber: string;

  secretCode: string;

  amount: number;

  reference?: string;

  idempotencyKey: string;
}

export interface InitiateAddMoneyInput {
  userId: string;

  amount: number;

  currency: string;

  sourceType: "BANK" | "MFS";

  provider:
    | "DEMO"
    | "BKASH"
    | "NAGAD"
    | "ROCKET"
    | "BANK_API";

  providerName: string;

  customerReference?: string;

  maskedAccount?: string;

  accountNumber?: string;

  secretCode?: string;

  idempotencyKey?: string;
}

export interface VerifyAndCreditAddMoneyInput {
  userId: string;

  transactionId: string;

  verificationCode?: string;
}

/* =========================================================
   RESULT TYPES
========================================================= */

interface PaymentResult {
  duplicate: boolean;

  intent: mongoose.HydratedDocument<any>;

  wallet:
    | any
    | null;

  providerTransactionId:
    | string
    | null;
}

interface ControllerCompatibleResult {
  transactionId: string;

  providerTransactionId:
    | string
    | null;

  status: string;

  verificationRequired: boolean;

  demoCode?: string;

  message: string;

  duplicate?: boolean;

  wallet?: any;
}

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

const normalizeIdempotencyKey = (
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

const toObjectId = (
  value: string
): mongoose.Types.ObjectId => {
  if (!mongoose.isValidObjectId(value)) {
    throw new Error(
      "Invalid user ID."
    );
  }

  return new mongoose.Types.ObjectId(
    value
  );
};

const safeString = (
  value: unknown
): string => {
  return typeof value === "string"
    ? value.trim()
    : "";
};

/* =========================================================
   VERIFY PAYMENT SOURCE
========================================================= */

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
    if (
      !isProviderName(
        providerName
      )
    ) {
      throw new Error(
        "Unsupported payment provider."
      );
    }

    const normalizedAccount =
      normalizeAccountNumber(
        accountNumber
      );

    const normalizedSecret =
      normalizeSecretCode(
        secretCode
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

    if (!normalizedSecret) {
      throw new Error(
        "Source account secret code is required."
      );
    }

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

    if (!source) {
      throw new Error(
        "No account was found for the selected provider."
      );
    }

    if (
      source.status !==
      "ACTIVE"
    ) {
      throw new Error(
        "Source payment account is not active."
      );
    }

    const incomingHash =
      hashSecretCode(
        normalizedSecret
      );

    const storedHash =
      source.get(
        "secretCodeHash"
      ) as
        | string
        | undefined;

    if (!storedHash) {
      throw new Error(
        "Source account authentication data is unavailable."
      );
    }

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
   CORE ADD MONEY
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
  }: AddMoneyInput): Promise<PaymentResult> => {
    const amountError =
      validateAddMoneyAmount(
        amount
      );

    if (amountError) {
      throw new Error(
        amountError
      );
    }

    const normalizedKey =
      normalizeIdempotencyKey(
        idempotencyKey
      );

    if (
      !normalizedKey ||
      normalizedKey.length <
        MIN_IDEMPOTENCY_LENGTH ||
      normalizedKey.length >
        MAX_IDEMPOTENCY_LENGTH
    ) {
      throw new Error(
        "A valid idempotency key is required."
      );
    }

    if (
      !isProviderName(
        providerName
      )
    ) {
      throw new Error(
        "Unsupported payment provider."
      );
    }

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

    const normalizedSecret =
      normalizeSecretCode(
        secretCode
      );

    if (!normalizedSecret) {
      throw new Error(
        "Source account secret code is required."
      );
    }

    const userObjectId =
      toObjectId(
        userId
      );

    /* =====================================================
       FAST IDEMPOTENCY CHECK
    ====================================================== */

    const existing =
      await PaymentIntent.findOne({
        userId:
          userObjectId,

        idempotencyKey:
          normalizedKey,
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

        intent:
          existing,

        wallet:
          existingWallet,

        providerTransactionId:
          existing.providerTransactionId ??
          null,
      };
    }

    const paymentProvider =
      getPaymentProvider(
        providerName
      );

    if (!paymentProvider) {
      throw new Error(
        "Payment provider is unavailable."
      );
    }

    const mongoSession =
      await mongoose.startSession();

    try {
      mongoSession.startTransaction();

      /* ===================================================
         LOCK / LOAD WALLET
      ================================================== */

      const wallet =
        await Wallet.findOne({
          userId:
            userObjectId,
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
         VERIFY SOURCE
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

      let intent:
        mongoose.HydratedDocument<any>;

      try {
        const created =
          await PaymentIntent.create(
            [
              {
                userId:
                  userObjectId,

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

                idempotencyKey:
                  normalizedKey,

                status:
                  "PROCESSING",
              },
            ],
            {
              session:
                mongoSession,
            }
          );

        if (!created[0]) {
          throw new Error(
            "Failed to create payment intent."
          );
        }

        intent =
          created[0];
      } catch (
        error: unknown
      ) {
        const duplicate =
          await PaymentIntent.findOne({
            userId:
              userObjectId,

            idempotencyKey:
              normalizedKey,
          })
            .session(
              mongoSession
            )
            .lean();

        if (duplicate) {
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

      const generatedProviderTransactionId =
        paymentProvider.createTransactionId();

      /* ===================================================
         PROVIDER DEBIT
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

        await intent.save({
          session:
            mongoSession,
        });

        throw new Error(
          debitResult.message ||
            "Provider debit failed."
        );
      }

      const finalProviderTransactionId =
        debitResult.providerTransactionId ||
        generatedProviderTransactionId;

      /* ===================================================
         SOURCE BALANCE MUTATION
      ================================================== */

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
         WALLET BALANCE MUTATION
      ================================================== */

      const balanceBefore =
        Number(
          wallet.balance ??
            0
        );

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

      const balanceAfter =
        Number(
          updatedWallet.balance ??
            balanceBefore +
              amount
        );

      /* ===================================================
         COMPLETE PAYMENT INTENT
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
         CREATE / UPSERT ADD MONEY TRANSACTION
      ================================================== */

      await AddMoneyTransaction.create(
        [
          {
            userId:
              userObjectId,

            walletId:
              wallet._id,

            amount,

            currency:
              "BDT",

            sourceType:
              inferSourceType(
                providerName
              ),

            provider:
              inferAddMoneyProvider(
                providerName
              ),

            providerName,

            status:
              "SUCCESS",

            idempotencyKey:
              normalizedKey,

            providerTransactionId:
              finalProviderTransactionId,

            customerReference:
              reference ||
              undefined,

            maskedAccount:
              maskAccountNumber(
                normalizedAccount
              ),

            initiatedAt:
              intent.createdAt ??
              new Date(),

            completedAt:
              new Date(),

            creditedAt:
              new Date(),

            balanceBefore,

            balanceAfter,
          },
        ],
        {
          session:
            mongoSession,
        }
      );

      /* ===================================================
         COMMIT
      ================================================== */

      await mongoSession.commitTransaction();

      return {
        duplicate: false,

        intent,

        wallet:
          updatedWallet,

        providerTransactionId:
          finalProviderTransactionId,
      };
    } catch (
      error: unknown
    ) {
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

/* =========================================================
   INITIATE ADD MONEY
   CONTROLLER COMPATIBILITY
========================================================= */

export const initiateAddMoney =
  async ({
    userId,
    amount,
    currency,
    sourceType,
    provider,
    providerName,
    customerReference,
    maskedAccount,
    accountNumber,
    secretCode,
    idempotencyKey,
  }: InitiateAddMoneyInput): Promise<ControllerCompatibleResult> => {
    if (
      currency &&
      currency.toUpperCase() !==
        "BDT"
    ) {
      throw new Error(
        "Only BDT is currently supported."
      );
    }

    if (
      sourceType !==
        "BANK" &&
      sourceType !==
        "MFS"
    ) {
      throw new Error(
        "sourceType must be BANK or MFS."
      );
    }

    if (
      provider !==
        "DEMO" &&
      provider !==
        "BKASH" &&
      provider !==
        "NAGAD" &&
      provider !==
        "ROCKET" &&
      provider !==
        "BANK_API"
    ) {
      throw new Error(
        "Unsupported payment provider type."
      );
    }

    const resolvedAccount =
      safeString(
        accountNumber
      );

    const resolvedSecret =
      safeString(
        secretCode
      );

    /*
     * The current real/demo payment provider flow
     * requires source account + secret.
     */
    if (!resolvedAccount) {
      throw new Error(
        "accountNumber is required."
      );
    }

    if (!resolvedSecret) {
      throw new Error(
        "secretCode is required."
      );
    }

    const resolvedKey =
      safeString(
        idempotencyKey
      );

    if (!resolvedKey) {
      throw new Error(
        "idempotencyKey is required."
      );
    }

    const result =
      await createAddMoney({
        userId,

        providerName,

        accountNumber:
          resolvedAccount,

        secretCode:
          resolvedSecret,

        amount,

        reference:
          customerReference ||
          undefined,

        idempotencyKey:
          resolvedKey,
      });

    const transactionId =
      result.intent?._id
        ? result.intent._id.toString()
        : "";

    return {
      transactionId,

      providerTransactionId:
        result.providerTransactionId,

      status:
        String(
          result.intent?.status ??
            "SUCCESS"
        ),

      /*
       * createAddMoney already verifies the
       * source secret and credits the wallet.
       */
      verificationRequired:
        false,

      message:
        result.duplicate
          ? "This Add Money request was already processed."
          : "Money added successfully.",

      duplicate:
        result.duplicate,

      wallet:
        result.wallet,
    };
  };

/* =========================================================
   VERIFY + CREDIT ADD MONEY
   CONTROLLER COMPATIBILITY
========================================================= */

export const verifyAndCreditAddMoney =
  async ({
    userId,
    transactionId,
    verificationCode,
  }: VerifyAndCreditAddMoneyInput): Promise<{
    transactionId: string;

    providerTransactionId:
      | string
      | null;

    status: string;

    message: string;

    wallet:
      | any
      | null;
  }> => {
    const userObjectId =
      toObjectId(
        userId
      );

    if (
      !mongoose.isValidObjectId(
        transactionId
      )
    ) {
      throw new Error(
        "Invalid transaction ID."
      );
    }

    /*
     * No second wallet credit happens here.
     *
     * The authoritative createAddMoney() flow has
     * already:
     *
     * 1. verified the source
     * 2. debited the source
     * 3. credited the wallet
     * 4. completed the PaymentIntent
     *
     * This function only reads the transaction safely.
     */

    const intent =
      await PaymentIntent.findOne({
        _id:
          transactionId,

        userId:
          userObjectId,
      }).lean();

    if (!intent) {
      throw new Error(
        "Add Money transaction not found."
      );
    }

    if (
      intent.status ===
      "FAILED"
    ) {
      throw new Error(
        "This Add Money transaction has failed."
      );
    }

    if (
      intent.status !==
      "SUCCESS"
    ) {
      throw new Error(
        "This Add Money transaction is not ready for confirmation."
      );
    }

    /*
     * verificationCode is intentionally not used
     * for another financial operation.
     *
     * It is accepted only for backwards compatibility
     * with an older controller contract.
     */
    void verificationCode;

    const wallet =
      intent.walletId
        ? await Wallet.findById(
            intent.walletId
          )
            .select(
              "_id userId balance pendingBalance currency status createdAt updatedAt"
            )
            .lean()
        : null;

    return {
      transactionId:
        intent._id.toString(),

      providerTransactionId:
        intent.providerTransactionId ??
        null,

      status:
        String(
          intent.status
        ),

      message:
        "Add Money transaction is already completed.",

      wallet,
    };
  };

/* =========================================================
   HELPERS
========================================================= */

function inferSourceType(
  providerName: string
): "BANK" | "MFS" {
  const mfsProviders = [
    "bkash",
    "nagad",
    "rocket",
    "upay",
  ];

  return mfsProviders.includes(
    providerName.toLowerCase()
  )
    ? "MFS"
    : "BANK";
}

function inferAddMoneyProvider(
  providerName: string
):
  | "DEMO"
  | "BKASH"
  | "NAGAD"
  | "ROCKET"
  | "BANK_API" {
  switch (
    providerName.toLowerCase()
  ) {
    case "bkash":
      return "BKASH";

    case "nagad":
      return "NAGAD";

    case "rocket":
      return "ROCKET";

    case "upay":
      return "DEMO";

    default:
      return "BANK_API";
  }
}

function maskAccountNumber(
  value: string
): string {
  if (!value) {
    return "";
  }

  const normalized =
    value.trim();

  if (
    normalized.length <= 4
  ) {
    return "*".repeat(
      normalized.length
    );
  }

  const visible =
    normalized.slice(-4);

  return `${"*".repeat(
    Math.max(
      4,
      normalized.length - 4
    )
  )}${visible}`;
}