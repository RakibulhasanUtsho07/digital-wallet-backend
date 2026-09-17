import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  Merchant,
} from "../models/Merchant.js";

import type {
  PaymentFailureCode,
  PaymentMode,
  PaymentSourceType,
  PaymentStatus,
} from "../models/Payment.js";

import {
  confirmWalletPayment,
  createWalletPayment,
  getCustomerCheckoutPayment,
  getWalletPayment,
} from "../services/walletPaymentService.js";

/* =========================================================
   MERCHANT REQUEST
========================================================= */

interface MerchantRequest
  extends AuthRequest {
  merchant?: {
    _id: string;
    ownerId: string;

    businessName: string;
    slug: string;

    status: string;
    verificationStatus: string;

    defaultCurrency: string;

    environment:
      | "test"
      | "live";

    apiKeyId: string;
    scopes?: string[];
  };
}

/* =========================================================
   PAYMENT RESPONSE TYPE
========================================================= */

interface PaymentResponseSource {
  paymentId: string;

  status:
    PaymentStatus;

  amount: {
    toString(): string;
  };

  currency: string;

  merchantId: {
    toString(): string;
  };

  customerId?: {
    toString(): string;
  };

  orderId?: {
    toString(): string;
  };

  merchantReference?: string;

  sourceType:
    PaymentSourceType;

  provider: string;

  mode:
    PaymentMode;

  failureCode?:
    PaymentFailureCode;

  failureMessage?: string;

  checkoutUrl?: string;
  returnUrl?: string;
  cancelUrl?: string;

  createdAt?: Date;
  updatedAt?: Date;

  authorizedAt?: Date;
  capturedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  cancelledAt?: Date;
  expiredAt?: Date;
}

/* =========================================================
   HELPERS
========================================================= */

const stringValue = (
  value: unknown
): string => {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
};

const optionalString = (
  value: unknown
): string | undefined => {
  const normalized =
    stringValue(value);

  return normalized ||
    undefined;
};

const errorMessage = (
  error: unknown
): string => {
  return error instanceof Error
    ? error.message
    : "Payment request failed.";
};

const objectIdString = (
  value: unknown
): string | undefined => {
  if (
    value === null ||
    value === undefined
  ) {
    return undefined;
  }

  const normalized =
    String(value).trim();

  return normalized ||
    undefined;
};

/* =========================================================
   PAYMENT SERIALIZER
========================================================= */

const serializePayment = (
  payment:
    PaymentResponseSource
) => {
  return {
    id:
      payment.paymentId,

    status:
      payment.status,

    amount:
      payment.amount.toString(),

    currency:
      payment.currency,

    merchantId:
      payment.merchantId.toString(),

    customerId:
      objectIdString(
        payment.customerId
      ),

    orderId:
      objectIdString(
        payment.orderId
      ),

    merchantReference:
      payment.merchantReference,

    sourceType:
      payment.sourceType,

    provider:
      payment.provider,

    mode:
      payment.mode,

    failureCode:
      payment.failureCode,

    failureMessage:
      payment.failureMessage,

    checkoutUrl:
      payment.checkoutUrl,

    returnUrl:
      payment.returnUrl,

    cancelUrl:
      payment.cancelUrl,

    createdAt:
      payment.createdAt,

    updatedAt:
      payment.updatedAt,

    authorizedAt:
      payment.authorizedAt,

    capturedAt:
      payment.capturedAt,

    completedAt:
      payment.completedAt,

    failedAt:
      payment.failedAt,

    cancelledAt:
      payment.cancelledAt,

    expiredAt:
      payment.expiredAt,
  };
};

/* =========================================================
   ERROR STATUS
========================================================= */

const getStatusCode = (
  message: string
): number => {
  const normalized =
    message.toLowerCase();

  if (
    normalized.includes(
      "authentication required"
    ) ||
    normalized.includes(
      "authentication is required"
    )
  ) {
    return 401;
  }

  if (
    normalized.includes(
      "not authorized"
    ) ||
    normalized.includes(
      "not enabled"
    ) ||
    normalized.includes(
      "verification is required"
    ) ||
    normalized.includes(
      "account is not active"
    )
  ) {
    return 403;
  }

  if (
    normalized.includes(
      "not found"
    )
  ) {
    return 404;
  }

  if (
    normalized.includes(
      "idempotency key has already"
    ) ||
    normalized.includes(
      "cannot be confirmed"
    ) ||
    normalized.includes(
      "already belongs"
    )
  ) {
    return 409;
  }

  if (
    normalized.includes(
      "required"
    ) ||
    normalized.includes(
      "invalid"
    ) ||
    normalized.includes(
      "too long"
    ) ||
    normalized.includes(
      "currency"
    ) ||
    normalized.includes(
      "amount"
    ) ||
    normalized.includes(
      "insufficient"
    ) ||
    normalized.includes(
      "return url"
    ) ||
    normalized.includes(
      "cancel url"
    )
  ) {
    return 400;
  }

  return 500;
};

const sendControllerError = (
  res: Response,
  error: unknown,
  fallbackMessage: string
): void => {
  if (res.headersSent) {
    return;
  }

  const message =
    errorMessage(error);

  const statusCode =
    getStatusCode(
      message
    );

  res.status(
    statusCode
  ).json({
    success: false,

    message:
      statusCode === 500
        ? fallbackMessage
        : message,
  });
};

/* =========================================================
   MERCHANT SUMMARY
========================================================= */

interface CheckoutMerchantRecord {
  _id: {
    toString(): string;
  };

  businessName: string;
  businessDisplayName?: string;
  slug: string;

  status: string;
  verificationStatus: string;
}

const getCheckoutMerchant =
  async (
    merchantId: string
  ) => {
    const merchant =
      await Merchant.findById(
        merchantId
      )
        .select(
          [
            "_id",
            "businessName",
            "businessDisplayName",
            "slug",
            "status",
            "verificationStatus",
          ].join(" ")
        )
        .lean<CheckoutMerchantRecord>();

    if (!merchant) {
      throw new Error(
        "Merchant account not found."
      );
    }

    return {
      id:
        merchant._id.toString(),

      businessName:
        merchant.businessName,

      displayName:
        merchant.businessDisplayName ||
        merchant.businessName,

      slug:
        merchant.slug,

      status:
        merchant.status,

      verificationStatus:
        merchant.verificationStatus,
    };
  };

/* =========================================================
   CREATE COFFER PAYMENT

   POST /api/v1/payments

   Authentication:
   Merchant secret API key

   customerId is optional. The merchant normally does not
   know the customer's internal Coffer user ID.
========================================================= */

export const createMerchantPaymentController =
  async (
    req: MerchantRequest,
    res: Response
  ): Promise<void> => {
    try {
      const merchant =
        req.merchant;

      if (!merchant?._id) {
        res.status(401).json({
          success: false,

          message:
            "Merchant authentication required.",
        });

        return;
      }

      const body =
        req.body &&
        typeof req.body ===
          "object" &&
        !Array.isArray(
          req.body
        )
          ? req.body
          : {};

      const {
        customerId,
        amount,
        currency,
        orderId,
        merchantReference,
        returnUrl,
        cancelUrl,
      } = body;

      /* ===================================================
         IDEMPOTENCY
      ================================================== */

      const idempotencyKey =
        stringValue(
          req.get(
            "Idempotency-Key"
          )
        );

      if (!idempotencyKey) {
        res.status(400).json({
          success: false,

          message:
            "Idempotency-Key header is required.",
        });

        return;
      }

      if (
        idempotencyKey.length >
        200
      ) {
        res.status(400).json({
          success: false,

          message:
            "Idempotency-Key is too long.",
        });

        return;
      }

      /* ===================================================
         CREATE PAYMENT

         customerId remains optional here.
      ================================================== */

      const result =
        await createWalletPayment({
          merchantId:
            merchant._id,

          customerId:
            optionalString(
              customerId
            ),

          amount,

          currency,

          orderId:
            optionalString(
              orderId
            ),

          merchantReference:
            optionalString(
              merchantReference
            ),

          returnUrl:
            optionalString(
              returnUrl
            ),

          cancelUrl:
            optionalString(
              cancelUrl
            ),

          mode:
            merchant.environment,

          idempotencyKey,
        });

      const payment =
        serializePayment(
          result.payment
        );

      res.status(
        result.duplicate
          ? 200
          : 201
      ).json({
        success: true,

        duplicate:
          result.duplicate,

        message:
          result.duplicate
            ? "Existing payment returned successfully."
            : "Coffer payment created successfully.",

        payment: {
          ...payment,

          merchant: {
            id:
              merchant._id,

            businessName:
              merchant.businessName,

            displayName:
              merchant.businessName,

            slug:
              merchant.slug,
          },
        },
      });
    } catch (error) {
      console.error(
        "CREATE COFFER PAYMENT ERROR:",
        error
      );

      sendControllerError(
        res,
        error,
        "Unable to create Coffer payment."
      );
    }
  };

/* =========================================================
   GET PAYMENT FOR MERCHANT

   GET /api/v1/payments/:paymentId

   Authentication:
   Merchant secret API key
========================================================= */

export const getMerchantPaymentController =
  async (
    req: MerchantRequest,
    res: Response
  ): Promise<void> => {
    try {
      const merchant =
        req.merchant;

      if (!merchant?._id) {
        res.status(401).json({
          success: false,

          message:
            "Merchant authentication required.",
        });

        return;
      }

      const paymentId =
        stringValue(
          req.params.paymentId
        );

      if (!paymentId) {
        res.status(400).json({
          success: false,

          message:
            "Payment ID is required.",
        });

        return;
      }

      /*
       * Service restricts the query using both
       * paymentId and merchantId.
       *
       * One merchant cannot access another
       * merchant's payment.
       */
      const payment =
        await getWalletPayment({
          paymentId,

          merchantId:
            merchant._id,
        });

      res.status(200).json({
        success: true,

        payment: {
          ...serializePayment(
            payment
          ),

          merchant: {
            id:
              merchant._id,

            businessName:
              merchant.businessName,

            displayName:
              merchant.businessName,

            slug:
              merchant.slug,
          },
        },
      });
    } catch (error) {
      console.error(
        "GET MERCHANT PAYMENT ERROR:",
        error
      );

      sendControllerError(
        res,
        error,
        "Unable to load merchant payment."
      );
    }
  };

/* =========================================================
   GET CUSTOMER CHECKOUT

   GET /api/v1/payments/:paymentId/checkout

   Authentication:
   Logged-in Coffer customer

   A pending unclaimed payment can be viewed by an
   authenticated customer. The actual customer binding
   happens atomically during confirmation.
========================================================= */

export const getCustomerCheckoutPaymentController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const customerId =
        req.user?._id;

      if (!customerId) {
        res.status(401).json({
          success: false,

          message:
            "Customer authentication required.",
        });

        return;
      }

      const paymentId =
        stringValue(
          req.params.paymentId
        );

      if (!paymentId) {
        res.status(400).json({
          success: false,

          message:
            "Payment ID is required.",
        });

        return;
      }

      const payment =
        await getCustomerCheckoutPayment({
          paymentId,

          customerId:
            customerId.toString(),
        });

      const merchant =
        await getCheckoutMerchant(
          payment.merchantId.toString()
        );

      res.status(200).json({
        success: true,

        payment: {
          ...serializePayment(
            payment
          ),

          merchant,
        },
      });
    } catch (error) {
      console.error(
        "GET COFFER CHECKOUT ERROR:",
        error
      );

      sendControllerError(
        res,
        error,
        "Unable to load Coffer checkout."
      );
    }
  };

/* =========================================================
   CONFIRM COFFER WALLET PAYMENT

   POST /api/v1/payments/:paymentId/confirm

   Authentication:
   Logged-in and verified Coffer customer

   The service must:
   1. Claim an unassigned payment for this customer.
   2. Debit customer wallet atomically.
   3. Credit merchant payable ledger.
   4. Complete the payment.
   5. Create payment.completed webhook events.
========================================================= */

export const confirmMerchantWalletPaymentController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const customerId =
        req.user?._id;

      if (!customerId) {
        res.status(401).json({
          success: false,

          message:
            "Customer authentication required.",
        });

        return;
      }

      const paymentId =
        stringValue(
          req.params.paymentId
        );

      if (!paymentId) {
        res.status(400).json({
          success: false,

          message:
            "Payment ID is required.",
        });

        return;
      }

      const result =
        await confirmWalletPayment({
          paymentId,

          customerId:
            customerId.toString(),
        });

      const payment =
        serializePayment(
          result.payment
        );

      res.status(200).json({
        success: true,

        duplicate:
          result.duplicate,

        message:
          result.duplicate
            ? "Payment was already completed."
            : "Payment completed successfully.",

        payment,

        ...(result.wallet
          ? {
              wallet: {
                balance:
                  result.wallet
                    .balance,

                currency:
                  result.wallet
                    .currency,
              },
            }
          : {}),
      });
    } catch (error) {
      console.error(
        "CONFIRM COFFER WALLET PAYMENT ERROR:",
        error
      );

      sendControllerError(
        res,
        error,
        "Unable to complete Coffer payment."
      );
    }
  };

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  createMerchantPaymentController,
  getMerchantPaymentController,
  getCustomerCheckoutPaymentController,
  confirmMerchantWalletPaymentController,
};