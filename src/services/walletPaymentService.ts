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
   * For normal hosted checkout, customer identity is
   * established later through checkout verification.
   */
  customerId?: string;

  amount:
    | string
    | number;

  currency?: string;

  /*
   * Internal Coffer Order ObjectId only.
   *
   * Merchant's external reference/order number belongs in
   * merchantReference.
   */
  orderId?: string;

  merchantReference?: string;

  returnUrl?: string;

  cancelUrl?: string;

  mode:
    PaymentMode;

  idempotencyKey:
    string;
}

export interface WalletPaymentResult {
  duplicate:
    boolean;

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

const normalizeString =
  (
    value:
      unknown
  ): string => {
    return typeof value ===
      "string"
      ? value.trim()
      : "";
  };

/* =========================================================
   CURRENCY
========================================================= */

const normalizeCurrency =
  (
    value:
      unknown
  ): string => {
    return (
      normalizeString(
        value
      ) ||
      "BDT"
    ).toUpperCase();
  };

/* =========================================================
   OBJECT ID
========================================================= */

const isValidObjectId =
  (
    value:
      string
  ): boolean => {
    return mongoose.isValidObjectId(
      value
    );
  };

/* =========================================================
   AMOUNT
========================================================= */

const parseAmount =
  (
    value:
      unknown
  ): string => {
    let raw:
      string;

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
        String(
          value
        );
    } else {
      raw =
        normalizeString(
          value
        );
    }

    if (
      !raw
    ) {
      throw new Error(
        "Payment amount is required."
      );
    }

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
      Number(
        raw
      );

    if (
      !Number.isFinite(
        amount
      ) ||
      amount <=
        0
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
        amount *
          100
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
      minorUnits /
      100
    ).toFixed(
      2
    );
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

      Date.now()
        .toString(
          36
        ),
    ].join(
      "_"
    );
  };

/* =========================================================
   OPTIONAL TEXT
========================================================= */

const normalizeOptionalText =
  (
    value:
      unknown,

    fieldName:
      string,

    maxLength =
      MAX_TEXT_LENGTH
  ):
    | string
    | undefined => {
    const normalized =
      normalizeString(
        value
      );

    if (
      !normalized
    ) {
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

const normalizeOptionalUrl =
  (
    value:
      unknown,

    fieldName:
      string
  ):
    | string
    | undefined => {
    const normalized =
      normalizeOptionalText(
        value,
        fieldName,
        2048
      );

    if (
      !normalized
    ) {
      return undefined;
    }

    let parsed:
      URL;

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
   MERCHANT ACCESS POLICY

   TEST
   - pending merchant allowed
   - active merchant allowed
   - verification NOT required
   - testEnabled must be true

   LIVE
   - merchant must be active
   - merchant must be verified
   - liveEnabled must be true
========================================================= */

const validateMerchantAccess =
  (
    merchant: {
      status:
        string;

      verificationStatus:
        string;

      defaultCurrency:
        string;

      testEnabled:
        boolean;

      liveEnabled:
        boolean;
    },

    mode:
      PaymentMode
  ): void => {
    /* =====================================================
       TEST
    ====================================================== */

    if (
      mode ===
      "test"
    ) {
      const allowedStatus =
        merchant.status ===
          "pending" ||
        merchant.status ===
          "active";

      if (
        !allowedStatus
      ) {
        throw new Error(
          "Merchant account is not available for test payments."
        );
      }

      if (
        merchant.testEnabled !==
        true
      ) {
        throw new Error(
          "Test payment access is not enabled for this merchant."
        );
      }

      return;
    }

    /* =====================================================
       LIVE
    ====================================================== */

    if (
      mode ===
      "live"
    ) {
      if (
        merchant.status !==
        "active"
      ) {
        throw new Error(
          "Merchant account must be active for live payments."
        );
      }

      if (
        merchant.verificationStatus !==
        "verified"
      ) {
        throw new Error(
          "Merchant verification is required for live payments."
        );
      }

      if (
        merchant.liveEnabled !==
        true
      ) {
        throw new Error(
          "Live payment access is not enabled for this merchant."
        );
      }

      return;
    }

    throw new Error(
      "Invalid payment mode."
    );
  };

/* =========================================================
   CHECKOUT URL
========================================================= */

const createCheckoutUrl =
  (
    paymentId:
      string
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

const validateExistingPayment =
  (
    existing:
      InstanceType<
        typeof Payment
      >,

    input: {
      amount:
        string;

      currency:
        string;

      customerId?:
        string;

      merchantReference?:
        string;

      returnUrl?:
        string;

      cancelUrl?:
        string;
    }
  ): void => {
    const existingAmount =
      Number(
        existing.amount.toString()
      ).toFixed(
        2
      );

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
   CREATE COFFER WALLET PAYMENT
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

    /* =====================================================
       MERCHANT ID
    ====================================================== */

    if (
      !isValidObjectId(
        merchantId
      )
    ) {
      throw new Error(
        "Invalid merchant ID."
      );
    }

    /* =====================================================
       OPTIONAL CUSTOMER
    ====================================================== */

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

    /* =====================================================
       IDEMPOTENCY KEY
    ====================================================== */

    if (
      !idempotencyKey
    ) {
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

    /* =====================================================
       AMOUNT / CURRENCY
    ====================================================== */

    const normalizedAmount =
      parseAmount(
        input.amount
      );

    const currency =
      normalizeCurrency(
        input.currency
      );

    /* =====================================================
       INTERNAL ORDER ID
    ====================================================== */

    const orderId =
      normalizeOptionalText(
        input.orderId,
        "Order ID",
        100
      );

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

    /* =====================================================
       MERCHANT REFERENCE
    ====================================================== */

    const merchantReference =
      normalizeOptionalText(
        input.merchantReference,
        "Merchant reference",
        150
      );

    /* =====================================================
       CALLBACK URLS
    ====================================================== */

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
          ].join(
            " "
          )
        )
        .lean();

    if (
      !merchant
    ) {
      throw new Error(
        "Merchant account not found."
      );
    }

    validateMerchantAccess(
      merchant,
      input.mode
    );

    /* =====================================================
       MERCHANT CURRENCY
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
       OPTIONAL PREASSIGNED CUSTOMER

       Normally third-party merchants should NOT send this.
    ====================================================== */

    if (
      customerId
    ) {
      const customerExists =
        await User.exists({
          _id:
            new mongoose.Types.ObjectId(
              customerId
            ),

          accountStatus:
            "active",
        });

      if (
        !customerExists
      ) {
        throw new Error(
          "Customer account not found."
        );
      }
    }

    const merchantObjectId =
      new mongoose.Types.ObjectId(
        merchantId
      );

    /* =====================================================
       IDEMPOTENCY LOOKUP
    ====================================================== */

    const existing =
      await Payment.findOne({
        merchantId:
          merchantObjectId,

        mode:
          input.mode,

        idempotencyKey,
      });

    if (
      existing
    ) {
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
        duplicate:
          true,

        payment:
          existing,
      };
    }

    /* =====================================================
       CREATE PAYMENT
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
        duplicate:
          false,

        payment,
      };
    } catch (
      error:
        unknown
    ) {
      /* ===================================================
         RACE-SAFE IDEMPOTENCY
      =================================================== */

      if (
        typeof error ===
          "object" &&
        error !==
          null &&
        "code" in
          error &&
        (
          error as {
            code?:
              unknown;
          }
        ).code ===
          11000
      ) {
        const duplicate =
          await Payment.findOne({
            merchantId:
              merchantObjectId,

            mode:
              input.mode,

            idempotencyKey,
          });

        if (
          duplicate
        ) {
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
            duplicate:
              true,

            payment:
              duplicate,
          };
        }
      }

      throw error;
    }
  };

/* =========================================================
   GET PAYMENT FOR MERCHANT API
========================================================= */

export const getWalletPayment =
  async ({
    paymentId,
    merchantId,
  }: {
    paymentId:
      string;

    merchantId:
      string;
  }) => {
    const normalizedPaymentId =
      normalizeString(
        paymentId
      );

    const normalizedMerchantId =
      normalizeString(
        merchantId
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

    if (
      !payment
    ) {
      throw new Error(
        "Payment not found."
      );
    }

    return payment;
  };

/* =========================================================
   LEGACY / INTERNAL CUSTOMER CHECKOUT LOOKUP

   This remains available for any internal flow which
   already knows a trusted Coffer customer ID.

   The new hosted merchant checkout does NOT require this
   method for its initial public GET.
========================================================= */

export const getCustomerCheckoutPayment =
  async ({
    paymentId,
    customerId,
  }: {
    paymentId:
      string;

    customerId:
      string;
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

    const payment =
      await Payment.findOne({
        paymentId:
          normalizedPaymentId,
      }).lean();

    if (
      !payment
    ) {
      throw new Error(
        "Payment not found."
      );
    }

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
   CONFIRM REAL COFFER WALLET PAYMENT

   IMPORTANT:

   This service is LIVE-WALLET ONLY.

   TEST payments are confirmed through the dedicated
   sandboxCheckoutPaymentService and must NEVER touch a
   real wallet.
========================================================= */

export const confirmWalletPayment =
  async ({
    paymentId,
    customerId,
  }: {
    paymentId:
      string;

    customerId:
      string;
  }) => {
    /* =====================================================
       NORMALIZE
    ====================================================== */

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
      =================================================== */

      const originalPayment =
        await Payment.findOne({
          paymentId:
            normalizedPaymentId,
        }).session(
          session
        );

      if (
        !originalPayment
      ) {
        throw new Error(
          "Payment not found."
        );
      }

      /* ===================================================
         CRITICAL SAFETY GUARD

         Test payments must NEVER reach the real wallet
         debit flow.
      =================================================== */

      if (
        originalPayment.mode ===
        "test"
      ) {
        throw new Error(
          "Test payments must use sandbox payment confirmation."
        );
      }

      if (
        originalPayment.mode !==
        "live"
      ) {
        throw new Error(
          "Invalid payment mode."
        );
      }

      /* ===================================================
         ALREADY COMPLETED
      =================================================== */

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
          duplicate:
            true,

          payment:
            originalPayment,
        };
      }

      /* ===================================================
         PAYMENT STATUS
      =================================================== */

      if (
        originalPayment.status !==
        "pending"
      ) {
        throw new Error(
          `Payment cannot be confirmed from status "${originalPayment.status}".`
        );
      }

      /* ===================================================
         LOAD MERCHANT
      =================================================== */

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
            ].join(
              " "
            )
          )
          .session(
            session
          )
          .lean();

      if (
        !merchant
      ) {
        throw new Error(
          "Merchant account not found."
        );
      }

      /* ===================================================
         LIVE MERCHANT POLICY
      =================================================== */

      validateMerchantAccess(
        merchant,
        originalPayment.mode
      );

      /* ===================================================
         CUSTOMER ACCOUNT

         Customer identity came from the verified checkout
         token, but we still re-check account availability
         immediately before moving money.
      =================================================== */

      const customer =
        await User.findOne({
          _id:
            customerObjectId,

          accountStatus:
            "active",
        })
          .select(
            "_id"
          )
          .session(
            session
          )
          .lean();

      if (
        !customer
      ) {
        throw new Error(
          "Customer account not found or is not active."
        );
      }

      /* ===================================================
         ATOMIC CUSTOMER CLAIM
      =================================================== */

      const payment =
        await Payment.findOneAndUpdate(
          {
            _id:
              originalPayment._id,

            mode:
              "live",

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
            new:
              true,

            session,

            runValidators:
              true,
          }
        );

      if (
        !payment
      ) {
        throw new Error(
          "This payment already belongs to another customer or is being processed."
        );
      }

      /* ===================================================
         CUSTOMER WALLET
      =================================================== */

      const wallet =
        await Wallet.findOne({
          userId:
            customerObjectId,

          status:
            "ACTIVE",
        }).session(
          session
        );

      if (
        !wallet
      ) {
        throw new Error(
          "Customer wallet not found or is not active."
        );
      }

      /* ===================================================
         CURRENCY
      =================================================== */

      if (
        wallet.currency.toUpperCase() !==
        payment.currency.toUpperCase()
      ) {
        throw new Error(
          "Wallet currency does not match payment currency."
        );
      }

      /* ===================================================
         PAYMENT AMOUNT
      =================================================== */

      const paymentAmount =
        Number(
          payment.amount.toString()
        );

      if (
        !Number.isFinite(
          paymentAmount
        ) ||
        paymentAmount <=
          0
      ) {
        throw new Error(
          "Invalid payment amount."
        );
      }

      /* ===================================================
         LEDGER ACCOUNTS
      =================================================== */

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
      =================================================== */

      await transitionPayment({
        paymentId:
          payment.paymentId,

        nextStatus:
          "authorized",

        session,
      });

      /* ===================================================
         ATOMIC WALLET DEBIT
      =================================================== */

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
            new:
              true,

            session,

            runValidators:
              true,
          }
        ).lean();

      if (
        !updatedWallet
      ) {
        throw new Error(
          "Insufficient wallet balance."
        );
      }

      /* ===================================================
         CAPTURE
      =================================================== */

      await transitionPayment({
        paymentId:
          payment.paymentId,

        nextStatus:
          "captured",

        session,
      });

      /* ===================================================
         BALANCED LEDGER
      =================================================== */

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
              paymentAmount.toFixed(
                2
              ),

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
              paymentAmount.toFixed(
                2
              ),

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
      =================================================== */

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
      =================================================== */

      await session.commitTransaction();

      /* ===================================================
         WEBHOOK

         Payment is already committed. Webhook failure must
         not roll the payment back.
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

      /* ===================================================
         RESULT
      =================================================== */

      return {
        duplicate:
          false,

        payment:
          completedPayment,

        wallet: {
          balance:
            updatedWallet.balance,

          currency:
            updatedWallet.currency,
        },
      };
    } catch (
      error
    ) {
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