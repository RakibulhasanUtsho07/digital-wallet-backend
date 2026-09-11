import mongoose from "mongoose";

import {
  Payment,
  type PaymentMode,
} from "../models/Payment.js";

import {
  Wallet,
} from "../models/Wallet.js";

import {
  User,
} from "../models/User.js";

import {
  Merchant,
} from "../models/Merchant.js";

import {
  createLedgerAccount,
  postBalancedLedger,
} from "./ledgerService.js";

import {
  transitionPayment,
} from "./paymentLifecycleService.js";


import {
  createPaymentWebhookEvents,
} from "./webhookService.js";
/* =========================================================
   TYPES
========================================================= */

export interface CreateWalletPaymentInput {
  merchantId: string;
  customerId: string;
  amount: string | number;
  currency?: string;
  orderId?: string;
  merchantReference?: string;
  returnUrl?: string;
  cancelUrl?: string;
  mode: PaymentMode;
  idempotencyKey: string;
}

export interface WalletPaymentResult {
  duplicate: boolean;
  payment: InstanceType<
    typeof Payment
  >;
}

/* =========================================================
   CONSTANTS
========================================================= */

const PROVIDER =
  "damo_wallet";

const SOURCE_TYPE =
  "wallet";

const MAX_PAYMENT_AMOUNT =
  500000;

const MAX_TEXT_LENGTH =
  2000;

/* =========================================================
   BASIC HELPERS
========================================================= */

const normalizeString = (
  value: unknown
): string => {
  return typeof value === "string"
    ? value.trim()
    : "";
};

const normalizeCurrency = (
  value: unknown
): string => {
  return (
    normalizeString(
      value
    ) ||
    "BDT"
  ).toUpperCase();
};

/* =========================================================
   AMOUNT
========================================================= */

const parseAmount = (
  value: unknown
): string => {
  let raw: string;

  if (
    typeof value ===
    "number"
  ) {
    raw =
      String(value);
  } else {
    raw =
      normalizeString(
        value
      );
  }

  if (!raw) {
    throw new Error(
      "Payment amount is required."
    );
  }

  const amount =
    Number(raw);

  if (
    !Number.isFinite(
      amount
    ) ||
    amount <= 0
  ) {
    throw new Error(
      "Invalid payment amount."
    );
  }

  if (
    amount >
    MAX_PAYMENT_AMOUNT
  ) {
    throw new Error(
      `Payment amount cannot exceed ${MAX_PAYMENT_AMOUNT}.`
    );
  }

  /*
   * Maximum 2 decimal places.
   */
  const minorUnits =
    Math.round(
      amount * 100
    );

  if (
    !Number.isSafeInteger(
      minorUnits
    )
  ) {
    throw new Error(
      "Payment amount is too large."
    );
  }

  if (
    Math.abs(
      amount -
        minorUnits / 100
    ) >
      0.0000001
  ) {
    throw new Error(
      "Payment amount can have maximum 2 decimal places."
    );
  }

  return (
    minorUnits /
    100
  ).toFixed(2);
};

/* =========================================================
   OBJECT ID
========================================================= */

const isValidObjectId = (
  value: string
): boolean => {
  return mongoose.isValidObjectId(
    value
  );
};

/* =========================================================
   PAYMENT ID
========================================================= */

const generatePaymentId = (): string => {
  return `pay_${new mongoose.Types.ObjectId().toString()}_${Date.now()
    .toString(36)}`;
};

/* =========================================================
   OPTIONAL TEXT
========================================================= */

const normalizeOptionalText = (
  value: unknown,
  fieldName: string
): string | undefined => {
  const normalized =
    normalizeString(
      value
    );

  if (!normalized) {
    return undefined;
  }

  if (
    normalized.length >
    MAX_TEXT_LENGTH
  ) {
    throw new Error(
      `${fieldName} is too long.`
    );
  }

  return normalized;
};

/* =========================================================
   CREATE PAYMENT
========================================================= */

export const createWalletPayment =
  async (
    input: CreateWalletPaymentInput
  ): Promise<WalletPaymentResult> => {
    const merchantId =
      normalizeString(
        input.merchantId
      );

    const customerId =
      normalizeString(
        input.customerId
      );

    const idempotencyKey =
      normalizeString(
        input.idempotencyKey
      );

    if (
      !isValidObjectId(
        merchantId
      )
    ) {
      throw new Error(
        "Invalid merchant ID."
      );
    }

    if (
      !isValidObjectId(
        customerId
      )
    ) {
      throw new Error(
        "Invalid customer ID."
      );
    }

    if (!idempotencyKey) {
      throw new Error(
        "Idempotency key is required."
      );
    }

    const normalizedAmount =
      parseAmount(
        input.amount
      );

    const currency =
      normalizeCurrency(
        input.currency
      );

    const orderId =
      normalizeOptionalText(
        input.orderId,
        "Order ID"
      );

    const merchantReference =
      normalizeOptionalText(
        input.merchantReference,
        "Merchant reference"
      );

    const returnUrl =
      normalizeOptionalText(
        input.returnUrl,
        "Return URL"
      );

    const cancelUrl =
      normalizeOptionalText(
        input.cancelUrl,
        "Cancel URL"
      );

    /* =====================================================
       MERCHANT
    ====================================================== */

    const merchant =
      await Merchant.findById(
        merchantId
      )
        .select(
          "status verificationStatus defaultCurrency testEnabled liveEnabled"
        )
        .lean();

    if (!merchant) {
      throw new Error(
        "Merchant account not found."
      );
    }

    if (
      merchant.status !==
      "active"
    ) {
      throw new Error(
        "Merchant account is not active."
      );
    }

    if (
      input.mode ===
        "live" &&
      merchant.liveEnabled !==
        true
    ) {
      throw new Error(
        "Live payment access is not enabled for this merchant."
      );
    }

    if (
      input.mode ===
        "live" &&
      merchant.verificationStatus !==
        "verified"
    ) {
      throw new Error(
        "Merchant verification is required for live payments."
      );
    }

    if (
      input.mode ===
        "test" &&
      merchant.testEnabled !==
        true
    ) {
      throw new Error(
        "Test payment access is not enabled for this merchant."
      );
    }

    /* =====================================================
       CUSTOMER
    ====================================================== */

    const customer =
      await User.findById(
        customerId
      )
        .select(
          "_id"
        )
        .lean();

    if (!customer) {
      throw new Error(
        "Customer account not found."
      );
    }

    /* =====================================================
       CURRENCY
    ====================================================== */

    const merchantCurrency =
      normalizeCurrency(
        merchant.defaultCurrency
      );

    if (
      currency !==
      merchantCurrency
    ) {
      throw new Error(
        `Merchant currency is ${merchantCurrency}.`
      );
    }

    /* =====================================================
       IDEMPOTENCY
    ====================================================== */

    const existing =
      await Payment.findOne({
        merchantId:
          new mongoose.Types.ObjectId(
            merchantId
          ),

        mode:
          input.mode,

        idempotencyKey,
      });

    if (existing) {
      /*
       * Protect against same idempotency key being
       * reused with a different payment request.
       */
      const existingAmount =
        Number(
          existing.amount.toString()
        );

      if (
        existingAmount.toFixed(2) !==
        normalizedAmount
      ) {
        throw new Error(
          "This idempotency key has already been used for a different amount."
        );
      }

      if (
        existing.currency !==
        currency
      ) {
        throw new Error(
          "This idempotency key has already been used with a different currency."
        );
      }

      if (
        existing.customerId?.toString() !==
        customerId
      ) {
        throw new Error(
          "This idempotency key has already been used for a different customer."
        );
      }

      return {
        duplicate: true,
        payment:
          existing,
      };
    }

    /* =====================================================
       PAYMENT ID
    ====================================================== */

    const paymentId =
      generatePaymentId();

    /* =====================================================
       CHECKOUT URL
    ====================================================== */

    const clientUrl =
      (
        process.env.CLIENT_URL?.trim() ||
        "http://localhost:3000"
      ).replace(
        /\/+$/,
        ""
      );

    const checkoutUrl =
      `${clientUrl}/payment/checkout/${paymentId}`;

    /* =====================================================
       CREATE PAYMENT
    ====================================================== */

    try {
      const payment =
        await Payment.create({
          paymentId,

          merchantId:
            new mongoose.Types.ObjectId(
              merchantId
            ),

          customerId:
            new mongoose.Types.ObjectId(
              customerId
            ),

          orderId:
            orderId ||
            undefined,

          amount:
            mongoose.Types.Decimal128.fromString(
              normalizedAmount
            ),

          currency,

          sourceType:
            SOURCE_TYPE,

          provider:
            PROVIDER,

          mode:
            input.mode,

          status:
            "pending",

          merchantReference:
            merchantReference ||
            undefined,

          idempotencyKey,

          returnUrl:
            returnUrl ||
            undefined,

          cancelUrl:
            cancelUrl ||
            undefined,

          checkoutUrl,
        });

      return {
        duplicate: false,
        payment,
      };
    } catch (error) {
      /*
       * Concurrent request using same merchant,
       * mode and idempotency key.
       */
      if (
        typeof error ===
          "object" &&
        error !== null &&
        "code" in error &&
        (error as {
          code?: unknown;
        }).code === 11000
      ) {
        const duplicate =
          await Payment.findOne({
            merchantId:
              new mongoose.Types.ObjectId(
                merchantId
              ),

            mode:
              input.mode,

            idempotencyKey,
          });

        if (duplicate) {
          return {
            duplicate: true,
            payment:
              duplicate,
          };
        }
      }

      throw error;
    }
  };

/* =========================================================
   GET MERCHANT PAYMENT
========================================================= */

export const getWalletPayment =
  async ({
    paymentId,
    merchantId,
  }: {
    paymentId: string;
    merchantId: string;
  }) => {
    const normalizedPaymentId =
      normalizeString(
        paymentId
      );

    if (
      !normalizedPaymentId
    ) {
      throw new Error(
        "Payment ID is required."
      );
    }

    if (
      !isValidObjectId(
        merchantId
      )
    ) {
      throw new Error(
        "Invalid merchant ID."
      );
    }

    const payment =
      await Payment.findOne({
        paymentId:
          normalizedPaymentId,

        merchantId:
          new mongoose.Types.ObjectId(
            merchantId
          ),
      }).lean();

    if (!payment) {
      throw new Error(
        "Payment not found."
      );
    }

    return payment;
  };

/* =========================================================
   GET CUSTOMER CHECKOUT PAYMENT
========================================================= */

export const getCustomerCheckoutPayment =
  async ({
    paymentId,
    customerId,
  }: {
    paymentId: string;
    customerId: string;
  }) => {
    const normalizedPaymentId =
      normalizeString(
        paymentId
      );

    if (
      !normalizedPaymentId
    ) {
      throw new Error(
        "Payment ID is required."
      );
    }

    if (
      !isValidObjectId(
        customerId
      )
    ) {
      throw new Error(
        "Invalid customer ID."
      );
    }

    const payment =
      await Payment.findOne({
        paymentId:
          normalizedPaymentId,

        customerId:
          new mongoose.Types.ObjectId(
            customerId
          ),
      }).lean();

    if (!payment) {
      throw new Error(
        "Payment not found."
      );
    }

    return payment;
  };

/* =========================================================
   CONFIRM WALLET PAYMENT
========================================================= */

export const confirmWalletPayment =
  async ({
    paymentId,
    customerId,
  }: {
    paymentId: string;
    customerId: string;
  }) => {
    const normalizedPaymentId =
      normalizeString(
        paymentId
      );

    const normalizedCustomerId =
      normalizeString(
        customerId
      );

    if (
      !normalizedPaymentId
    ) {
      throw new Error(
        "Payment ID is required."
      );
    }

    if (
      !isValidObjectId(
        normalizedCustomerId
      )
    ) {
      throw new Error(
        "Invalid customer ID."
      );
    }

    const session =
      await mongoose.startSession();

    try {
      session.startTransaction();

      /* ===================================================
         LOAD PAYMENT
      ================================================== */

      const payment =
        await Payment.findOne({
          paymentId:
            normalizedPaymentId,
        }).session(
          session
        );

      if (!payment) {
        throw new Error(
          "Payment not found."
        );
      }

      /* ===================================================
         ALREADY COMPLETED
      ================================================== */

      if (
        payment.status ===
        "completed"
      ) {
        if (
          payment.customerId?.toString() !==
          normalizedCustomerId
        ) {
          throw new Error(
            "You are not authorized to access this payment."
          );
        }

        await session.commitTransaction();

        return {
          duplicate: true,

          payment,
        };
      }

      /* ===================================================
         PAYMENT STATUS
      ================================================== */

      if (
        payment.status !==
        "pending"
      ) {
        throw new Error(
          `Payment cannot be confirmed from status "${payment.status}".`
        );
      }

      /* ===================================================
         CUSTOMER AUTHORIZATION
      ================================================== */

      if (
        !payment.customerId ||
        payment.customerId.toString() !==
          normalizedCustomerId
      ) {
        throw new Error(
          "You are not authorized to approve this payment."
        );
      }

      /* ===================================================
         CUSTOMER WALLET
      ================================================== */

      const wallet =
        await Wallet.findOne({
          userId:
            new mongoose.Types.ObjectId(
              normalizedCustomerId
            ),

          status:
            "ACTIVE",
        }).session(
          session
        );

      if (!wallet) {
        throw new Error(
          "Customer wallet not found or is not active."
        );
      }

      /* ===================================================
         CURRENCY CHECK
      ================================================== */

      if (
        wallet.currency.toUpperCase() !==
        payment.currency.toUpperCase()
      ) {
        throw new Error(
          "Wallet currency does not match payment currency."
        );
      }

      /* ===================================================
         AMOUNT
      ================================================== */

      const paymentAmount =
        Number(
          payment.amount.toString()
        );

      if (
        !Number.isFinite(
          paymentAmount
        ) ||
        paymentAmount <= 0
      ) {
        throw new Error(
          "Invalid payment amount."
        );
      }

      /* ===================================================
         CUSTOMER LEDGER ACCOUNT
      ================================================== */

      const customerLedgerAccount =
        await createLedgerAccount({
          accountCode:
            `wallet:user:${normalizedCustomerId}`,

          name:
            `Customer Wallet - ${normalizedCustomerId}`,

          accountType:
            "liability",

          ownerType:
            "user",

          ownerId:
            normalizedCustomerId,

          currency:
            payment.currency,

          description:
            "Customer wallet liability account.",
        });

      /* ===================================================
         MERCHANT LEDGER ACCOUNT
      ================================================== */

      const merchantLedgerAccount =
        await createLedgerAccount({
          accountCode:
            `merchant:payable:${payment.merchantId.toString()}`,

          name:
            `Merchant Payable - ${payment.merchantId.toString()}`,

          accountType:
            "liability",

          ownerType:
            "merchant",

          ownerId:
            payment.merchantId.toString(),

          currency:
            payment.currency,

          description:
            "Merchant payable liability account.",
        });

      /* ===================================================
         AUTHORIZED
      ================================================== */

      await transitionPayment({
        paymentId:
          payment.paymentId,

        nextStatus:
          "authorized",

        session,
      });

      /* ===================================================
         ATOMIC WALLET DEBIT
      ================================================== */

      const updatedWallet =
        await Wallet.findOneAndUpdate(
          {
            _id:
              wallet._id,

            status:
              "ACTIVE",

            balance: {
              $gte:
                paymentAmount,
            },
          },
          {
            $inc: {
              balance:
                -paymentAmount,
            },
          },
          {
            new: true,

            session,
          }
        ).lean();

      if (!updatedWallet) {
        throw new Error(
          "Insufficient wallet balance."
        );
      }

      /* ===================================================
         CAPTURED
      ================================================== */

      await transitionPayment({
        paymentId:
          payment.paymentId,

        nextStatus:
          "captured",

        session,
      });

      /* ===================================================
         LEDGER
      ================================================== */

      await postBalancedLedger({
        referenceType:
          "payment",

        referenceId:
          payment.paymentId,

        idempotencyKey:
          `payment:${payment.paymentId}`,

        description:
          `Wallet payment ${payment.paymentId}`,

        lines: [
          {
            accountId:
              customerLedgerAccount._id.toString(),

            direction:
              "debit",

            amount:
              paymentAmount.toFixed(2),

            currency:
              payment.currency,

            description:
              `Customer wallet debit for payment ${payment.paymentId}`,
          },

          {
            accountId:
              merchantLedgerAccount._id.toString(),

            direction:
              "credit",

            amount:
              paymentAmount.toFixed(2),

            currency:
              payment.currency,

            description:
              `Merchant payable credit for payment ${payment.paymentId}`,
          },
        ],

        session,
      });

      /* ===================================================
         COMPLETED
      ================================================== */

      const completedPayment =
        await transitionPayment({
          paymentId:
            payment.paymentId,

          nextStatus:
            "completed",

          session,
        });

      /* ===================================================
         COMMIT
      ================================================== */
await session.commitTransaction();

/* ===================================================
   WEBHOOK
 *
 * IMPORTANT:
 *
 * The financial transaction is committed first.
 * Webhook delivery must never cause a successful
 * wallet payment to be rolled back.
=================================================== */

try {
  await createPaymentWebhookEvents({
    payment: {
      paymentId:
        completedPayment.paymentId,

      merchantId:
        completedPayment.merchantId.toString(),

      mode:
        completedPayment.mode,

      amount:
        completedPayment.amount,

      currency:
        completedPayment.currency,

      customerId:
        completedPayment.customerId?.toString(),

      orderId:
        completedPayment.orderId?.toString(),

      merchantReference:
        completedPayment.merchantReference,

      status:
        completedPayment.status,

      provider:
        completedPayment.provider,

      sourceType:
        completedPayment.sourceType,

      createdAt:
        completedPayment.createdAt,

      authorizedAt:
        completedPayment.authorizedAt,

      capturedAt:
        completedPayment.capturedAt,

      completedAt:
        completedPayment.completedAt,

      failedAt:
        completedPayment.failedAt,

      cancelledAt:
        completedPayment.cancelledAt,

      expiredAt:
        completedPayment.expiredAt,
    },

    eventType:
      "payment.completed",
  });
} catch (webhookError) {
  /*
   * Payment is already financially committed.
   *
   * Webhook failure must not turn a successful
   * payment into a failed payment.
   */
  console.error(
    "WEBHOOK EVENT CREATION ERROR:",
    webhookError
  );
}

return {
  duplicate: false,

  payment:
    completedPayment,

  wallet: {
    balance:
      updatedWallet.balance,

    currency:
      updatedWallet.currency,
  },
};
    } catch (error) {
      if (
        session.inTransaction()
      ) {
        await session.abortTransaction();
      }

      throw error;
    } finally {
      await session.endSession();
    }
  };