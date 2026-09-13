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

  /*
   * Optional because a merchant normally does not know
   * the customer's internal Coffer user ID.
   *
   * The authenticated customer is bound securely when
   * the payment is confirmed.
   */
  customerId?: string;

  amount:
    | string
    | number;

  currency?: string;

  /*
   * Internal Coffer Order ObjectId only.
   * Merchant's own order number should be sent using
   * merchantReference.
   */
  orderId?: string;

  merchantReference?: string;

  returnUrl?: string;
  cancelUrl?: string;

  mode:
    PaymentMode;

  idempotencyKey: string;
}

export interface WalletPaymentResult {
  duplicate: boolean;

  payment:
    InstanceType<
      typeof Payment
    >;
}

/* =========================================================
   CONSTANTS
========================================================= */

const PROVIDER =
  "coffer_wallet";

const SOURCE_TYPE =
  "wallet";

const MAX_PAYMENT_AMOUNT =
  500000;

const MAX_TEXT_LENGTH =
  2000;

const MAX_IDEMPOTENCY_LENGTH =
  200;

/* =========================================================
   BASIC HELPERS
========================================================= */

const normalizeString = (
  value: unknown
): string => {
  return typeof value ===
    "string"
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

const isValidObjectId = (
  value: string
): boolean => {
  return mongoose.isValidObjectId(
    value
  );
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
    if (
      !Number.isFinite(
        value
      )
    ) {
      throw new Error(
        "Invalid payment amount."
      );
    }

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

  /*
   * Only positive values with maximum two decimal places.
   */
  if (
    !/^\d+(?:\.\d{1,2})?$/.test(
      raw
    )
  ) {
    throw new Error(
      "Payment amount can have maximum 2 decimal places."
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

  return (
    minorUnits / 100
  ).toFixed(2);
};

/* =========================================================
   PAYMENT ID
========================================================= */

const generatePaymentId =
  (): string => {
    return [
      "pay",
      new mongoose.Types.ObjectId()
        .toString(),
      Date.now().toString(36),
    ].join("_");
  };

/* =========================================================
   OPTIONAL TEXT
========================================================= */

const normalizeOptionalText = (
  value: unknown,
  fieldName: string,
  maxLength =
    MAX_TEXT_LENGTH
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
    maxLength
  ) {
    throw new Error(
      `${fieldName} is too long.`
    );
  }

  return normalized;
};

/* =========================================================
   OPTIONAL URL
========================================================= */

const normalizeOptionalUrl = (
  value: unknown,
  fieldName: string
): string | undefined => {
  const normalized =
    normalizeOptionalText(
      value,
      fieldName,
      2048
    );

  if (!normalized) {
    return undefined;
  }

  let parsed: URL;

  try {
    parsed =
      new URL(
        normalized
      );
  } catch {
    throw new Error(
      `${fieldName} is invalid.`
    );
  }

  if (
    parsed.protocol !==
      "http:" &&
    parsed.protocol !==
      "https:"
  ) {
    throw new Error(
      `${fieldName} must use HTTP or HTTPS.`
    );
  }

  if (
    process.env.NODE_ENV ===
      "production" &&
    parsed.protocol !==
      "https:"
  ) {
    throw new Error(
      `${fieldName} must use HTTPS in production.`
    );
  }

  if (
    parsed.username ||
    parsed.password
  ) {
    throw new Error(
      `${fieldName} cannot contain URL credentials.`
    );
  }

  return parsed.toString();
};

/* =========================================================
   MERCHANT VALIDATION
========================================================= */

const validateMerchantAccess = (
  merchant: {
    status: string;
    verificationStatus: string;
    defaultCurrency: string;
    testEnabled: boolean;
    liveEnabled: boolean;
  },
  mode: PaymentMode
): void => {
  if (
    merchant.status !==
    "active"
  ) {
    throw new Error(
      "Merchant account is not active."
    );
  }

  if (
    mode === "test" &&
    merchant.testEnabled !==
      true
  ) {
    throw new Error(
      "Test payment access is not enabled for this merchant."
    );
  }

  if (
    mode === "live" &&
    merchant.liveEnabled !==
      true
  ) {
    throw new Error(
      "Live payment access is not enabled for this merchant."
    );
  }

  if (
    mode === "live" &&
    merchant.verificationStatus !==
      "verified"
  ) {
    throw new Error(
      "Merchant verification is required for live payments."
    );
  }
};

/* =========================================================
   CHECKOUT URL
========================================================= */

const createCheckoutUrl = (
  paymentId: string
): string => {
  const clientUrl =
    (
      process.env.CLIENT_URL
        ?.trim() ||
      "http://localhost:3000"
    ).replace(
      /\/+$/,
      ""
    );

  let parsedClientUrl:
    URL;

  try {
    parsedClientUrl =
      new URL(
        clientUrl
      );
  } catch {
    throw new Error(
      "CLIENT_URL is invalid."
    );
  }

  if (
    process.env.NODE_ENV ===
      "production" &&
    parsedClientUrl.protocol !==
      "https:"
  ) {
    throw new Error(
      "CLIENT_URL must use HTTPS in production."
    );
  }

  return `${clientUrl}/payment/checkout/${encodeURIComponent(
    paymentId
  )}`;
};

/* =========================================================
   IDEMPOTENCY VALIDATION
========================================================= */

const validateExistingPayment = (
  existing:
    InstanceType<
      typeof Payment
    >,
  input: {
    amount: string;
    currency: string;
    customerId?: string;
    merchantReference?: string;
    returnUrl?: string;
    cancelUrl?: string;
  }
): void => {
  const existingAmount =
    Number(
      existing.amount.toString()
    ).toFixed(2);

  if (
    existingAmount !==
    input.amount
  ) {
    throw new Error(
      "This idempotency key has already been used for a different amount."
    );
  }

  if (
    existing.currency !==
    input.currency
  ) {
    throw new Error(
      "This idempotency key has already been used with a different currency."
    );
  }

  const existingCustomerId =
    existing.customerId
      ?.toString();

  if (
    existingCustomerId !==
    input.customerId
  ) {
    throw new Error(
      "This idempotency key has already been used for a different customer."
    );
  }

  if (
    (
      existing.merchantReference ||
      undefined
    ) !==
    input.merchantReference
  ) {
    throw new Error(
      "This idempotency key has already been used with a different merchant reference."
    );
  }

  if (
    (
      existing.returnUrl ||
      undefined
    ) !==
    input.returnUrl
  ) {
    throw new Error(
      "This idempotency key has already been used with a different return URL."
    );
  }

  if (
    (
      existing.cancelUrl ||
      undefined
    ) !==
    input.cancelUrl
  ) {
    throw new Error(
      "This idempotency key has already been used with a different cancel URL."
    );
  }
};

/* =========================================================
   CREATE COFFER PAYMENT
========================================================= */

export const createWalletPayment =
  async (
    input:
      CreateWalletPaymentInput
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

    /*
     * Validate customer only when merchant intentionally
     * creates a payment for a known Coffer customer.
     */
    if (
      customerId &&
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

    if (
      idempotencyKey.length >
      MAX_IDEMPOTENCY_LENGTH
    ) {
      throw new Error(
        "Idempotency key is too long."
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
        "Order ID",
        100
      );

    /*
     * Payment.orderId references Coffer's internal
     * Order model and must therefore be an ObjectId.
     *
     * External store order numbers belong in
     * merchantReference.
     */
    if (
      orderId &&
      !isValidObjectId(
        orderId
      )
    ) {
      throw new Error(
        "Invalid internal order ID. Use merchantReference for the merchant order number."
      );
    }

    const merchantReference =
      normalizeOptionalText(
        input.merchantReference,
        "Merchant reference",
        150
      );

    const returnUrl =
      normalizeOptionalUrl(
        input.returnUrl,
        "Return URL"
      );

    const cancelUrl =
      normalizeOptionalUrl(
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
          [
            "status",
            "verificationStatus",
            "defaultCurrency",
            "testEnabled",
            "liveEnabled",
          ].join(" ")
        )
        .lean();

    if (!merchant) {
      throw new Error(
        "Merchant account not found."
      );
    }

    validateMerchantAccess(
      merchant,
      input.mode
    );

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
       OPTIONAL PREASSIGNED CUSTOMER
    ====================================================== */

    if (customerId) {
      const customerExists =
        await User.exists({
          _id:
            new mongoose.Types.ObjectId(
              customerId
            ),
        });

      if (!customerExists) {
        throw new Error(
          "Customer account not found."
        );
      }
    }

    /* =====================================================
       IDEMPOTENCY
    ====================================================== */

    const merchantObjectId =
      new mongoose.Types.ObjectId(
        merchantId
      );

    const existing =
      await Payment.findOne({
        merchantId:
          merchantObjectId,

        mode:
          input.mode,

        idempotencyKey,
      });

    if (existing) {
      validateExistingPayment(
        existing,
        {
          amount:
            normalizedAmount,

          currency,

          customerId:
            customerId ||
            undefined,

          merchantReference,

          returnUrl,

          cancelUrl,
        }
      );

      return {
        duplicate: true,
        payment:
          existing,
      };
    }

    /* =====================================================
       PAYMENT
    ====================================================== */

    const paymentId =
      generatePaymentId();

    const checkoutUrl =
      createCheckoutUrl(
        paymentId
      );

    try {
      const payment =
        await Payment.create({
          paymentId,

          merchantId:
            merchantObjectId,

          customerId:
            customerId
              ? new mongoose.Types.ObjectId(
                  customerId
                )
              : undefined,

          orderId:
            orderId
              ? new mongoose.Types.ObjectId(
                  orderId
                )
              : undefined,

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

          merchantReference,

          idempotencyKey,

          returnUrl,

          cancelUrl,

          checkoutUrl,
        });

      return {
        duplicate: false,
        payment,
      };
    } catch (error: unknown) {
      /*
       * Concurrent requests may reach the unique
       * idempotency index at the same time.
       */
      if (
        typeof error ===
          "object" &&
        error !== null &&
        "code" in error &&
        (
          error as {
            code?: unknown;
          }
        ).code === 11000
      ) {
        const duplicate =
          await Payment.findOne({
            merchantId:
              merchantObjectId,

            mode:
              input.mode,

            idempotencyKey,
          });

        if (duplicate) {
          validateExistingPayment(
            duplicate,
            {
              amount:
                normalizedAmount,

              currency,

              customerId:
                customerId ||
                undefined,

              merchantReference,

              returnUrl,

              cancelUrl,
            }
          );

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
   GET PAYMENT FOR MERCHANT
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

    const normalizedMerchantId =
      normalizeString(
        merchantId
      );

    if (!normalizedPaymentId) {
      throw new Error(
        "Payment ID is required."
      );
    }

    if (
      !isValidObjectId(
        normalizedMerchantId
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
            normalizedMerchantId
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

    const normalizedCustomerId =
      normalizeString(
        customerId
      );

    if (!normalizedPaymentId) {
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

    /*
     * Do not claim the payment during GET.
     *
     * GET requests must remain read-only. The payment will
     * be bound atomically when the customer presses Pay.
     */
    const payment =
      await Payment.findOne({
        paymentId:
          normalizedPaymentId,
      }).lean();

    if (!payment) {
      throw new Error(
        "Payment not found."
      );
    }

    /*
     * If the merchant preassigned this payment to a
     * customer, only that customer may access it.
     */
    if (
      payment.customerId &&
      payment.customerId.toString() !==
        normalizedCustomerId
    ) {
      throw new Error(
        "You are not authorized to access this payment."
      );
    }

    return payment;
  };

/* =========================================================
   CONFIRM COFFER WALLET PAYMENT
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

    if (!normalizedPaymentId) {
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

    const customerObjectId =
      new mongoose.Types.ObjectId(
        normalizedCustomerId
      );

    const session =
      await mongoose.startSession();

    try {
      session.startTransaction();

      /* ===================================================
         LOAD PAYMENT
      ================================================== */

      const originalPayment =
        await Payment.findOne({
          paymentId:
            normalizedPaymentId,
        }).session(
          session
        );

      if (!originalPayment) {
        throw new Error(
          "Payment not found."
        );
      }

      /* ===================================================
         ALREADY COMPLETED
      ================================================== */

      if (
        originalPayment.status ===
        "completed"
      ) {
        if (
          originalPayment.customerId
            ?.toString() !==
          normalizedCustomerId
        ) {
          throw new Error(
            "You are not authorized to access this payment."
          );
        }

        await session.commitTransaction();

        return {
          duplicate: true,

          payment:
            originalPayment,
        };
      }

      if (
        originalPayment.status !==
        "pending"
      ) {
        throw new Error(
          `Payment cannot be confirmed from status "${originalPayment.status}".`
        );
      }

      /* ===================================================
         MERCHANT VALIDATION
      ================================================== */

      const merchant =
        await Merchant.findById(
          originalPayment.merchantId
        )
          .select(
            [
              "status",
              "verificationStatus",
              "defaultCurrency",
              "testEnabled",
              "liveEnabled",
            ].join(" ")
          )
          .session(
            session
          )
          .lean();

      if (!merchant) {
        throw new Error(
          "Merchant account not found."
        );
      }

      validateMerchantAccess(
        merchant,
        originalPayment.mode
      );

      /* ===================================================
         ATOMIC CUSTOMER CLAIM

         Conditions:
         - payment must still be pending
         - customerId must be empty or already equal to
           the current authenticated customer
      ================================================== */

      const payment =
        await Payment.findOneAndUpdate(
          {
            _id:
              originalPayment._id,

            status:
              "pending",

            $or: [
              {
                customerId: {
                  $exists:
                    false,
                },
              },
              {
                customerId:
                  null,
              },
              {
                customerId:
                  customerObjectId,
              },
            ],
          },
          {
            $set: {
              customerId:
                customerObjectId,
            },
          },
          {
            new: true,
            session,
            runValidators: true,
          }
        );

      if (!payment) {
        throw new Error(
          "This payment already belongs to another customer or is being processed."
        );
      }

      /* ===================================================
         CUSTOMER WALLET
      ================================================== */

      const wallet =
        await Wallet.findOne({
          userId:
            customerObjectId,

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

      if (
        wallet.currency.toUpperCase() !==
        payment.currency.toUpperCase()
      ) {
        throw new Error(
          "Wallet currency does not match payment currency."
        );
      }

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
         LEDGER ACCOUNTS
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

      const merchantId =
        payment.merchantId.toString();

      const merchantLedgerAccount =
        await createLedgerAccount({
          accountCode:
            `merchant:payable:${merchantId}`,

          name:
            `Merchant Payable - ${merchantId}`,

          accountType:
            "liability",

          ownerType:
            "merchant",

          ownerId:
            merchantId,

          currency:
            payment.currency,

          description:
            "Merchant payable liability account.",
        });

      /* ===================================================
         AUTHORIZE
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
            runValidators: true,
          }
        ).lean();

      if (!updatedWallet) {
        throw new Error(
          "Insufficient wallet balance."
        );
      }

      /* ===================================================
         CAPTURE
      ================================================== */

      await transitionPayment({
        paymentId:
          payment.paymentId,

        nextStatus:
          "captured",

        session,
      });

      /* ===================================================
         BALANCED LEDGER
      ================================================== */

      await postBalancedLedger({
        referenceType:
          "payment",

        referenceId:
          payment.paymentId,

        idempotencyKey:
          `payment:${payment.paymentId}`,

        description:
          `Coffer wallet payment ${payment.paymentId}`,

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
         COMPLETE
      ================================================== */

      const completedPayment =
        await transitionPayment({
          paymentId:
            payment.paymentId,

          nextStatus:
            "completed",

          session,
        });

      await session.commitTransaction();

      /*
       * The financial transaction is already committed.
       * Webhook creation must not roll it back.
       */
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
              completedPayment.customerId
                ?.toString(),

            orderId:
              completedPayment.orderId
                ?.toString(),

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
      } catch (
        webhookError
      ) {
        console.error(
          "PAYMENT WEBHOOK CREATION ERROR:",
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