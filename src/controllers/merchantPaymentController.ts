import type {
  Request,
  Response,
} from "express";

import {
  Merchant,
} from "../models/Merchant.js";

import {
  Payment,
} from "../models/Payment.js";

import type {
  PaymentFailureCode,
  PaymentMode,
  PaymentSourceType,
  PaymentStatus,
} from "../models/Payment.js";

import {
  confirmWalletPayment,
  createWalletPayment,
  getWalletPayment,
} from "../services/walletPaymentService.js";

import {
  authenticateCheckoutCustomer,
  assertLiveCustomerKyc,
  CheckoutVerificationError,
  getSandboxCheckoutCredentials,
  verifyCheckoutOtp,
  verifyCheckoutToken,
} from "../services/checkoutVerificationService.js";

import {
  confirmSandboxPayment,
} from "../services/sandboxCheckoutPaymentService.js";

/* =========================================================
   MERCHANT REQUEST
========================================================= */

interface MerchantRequest
  extends Request {
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
  paymentId:
    string;

  status:
    PaymentStatus;

  amount: {
    toString():
      string;
  };

  currency:
    string;

  merchantId: {
    toString():
      string;
  };

  customerId?: {
    toString():
      string;
  };

  orderId?: {
    toString():
      string;
  };

  merchantReference?:
    string;

  sourceType:
    PaymentSourceType;

  provider:
    string;

  mode:
    PaymentMode;

  failureCode?:
    PaymentFailureCode;

  failureMessage?:
    string;

  checkoutUrl?:
    string;

  returnUrl?:
    string;

  cancelUrl?:
    string;

  createdAt?:
    Date;

  updatedAt?:
    Date;

  authorizedAt?:
    Date;

  capturedAt?:
    Date;

  completedAt?:
    Date;

  failedAt?:
    Date;

  cancelledAt?:
    Date;

  expiredAt?:
    Date;
}

/* =========================================================
   HELPERS
========================================================= */

function stringValue(
  value:
    unknown
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function optionalString(
  value:
    unknown
):
  | string
  | undefined {
  const normalized =
    stringValue(
      value
    );

  return normalized ||
    undefined;
}

function identifierString(
  value:
    unknown
):
  | string
  | undefined {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return undefined;
  }

  const normalized =
    String(
      value
    ).trim();

  return normalized ||
    undefined;
}

/* =========================================================
   SERIALIZE
========================================================= */

function serializePayment(
  payment:
    PaymentResponseSource
) {
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
      identifierString(
        payment.customerId
      ),

    orderId:
      identifierString(
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
}

/* =========================================================
   CONTROLLER ERROR
========================================================= */

function sendError(
  res:
    Response,

  error:
    unknown,

  fallback:
    string
): void {
  if (
    error instanceof
    CheckoutVerificationError
  ) {
    res.status(
      error.statusCode
    ).json({
      success:
        false,

      code:
        error.code,

      message:
        error.message,
    });

    return;
  }

  const message =
    error instanceof
      Error
      ? error.message
      : fallback;

  const lower =
    message.toLowerCase();

  const status =
    lower.includes(
      "not found"
    )
      ? 404
      : lower.includes(
            "not authorized"
          ) ||
          lower.includes(
            "not enabled"
          ) ||
          lower.includes(
            "verification"
          )
        ? 403
        : lower.includes(
              "required"
            ) ||
            lower.includes(
              "invalid"
            ) ||
            lower.includes(
              "currency"
            ) ||
            lower.includes(
              "amount"
            ) ||
            lower.includes(
              "insufficient"
            )
          ? 400
          : lower.includes(
                "cannot be"
              ) ||
              lower.includes(
                "already"
              )
            ? 409
            : 500;

  res.status(
    status
  ).json({
    success:
      false,

    message:
      status ===
      500
        ? fallback
        : message,
  });
}

/* =========================================================
   MERCHANT
========================================================= */

async function getCheckoutMerchant(
  merchantId:
    string
) {
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
        ].join(
          " "
        )
      )
      .lean();

  if (!merchant) {
    throw new Error(
      "Merchant account not found."
    );
  }

  const record =
    merchant as unknown as {
      _id: {
        toString(): string;
      };

      businessName:
        string;

      businessDisplayName?:
        string;

      slug:
        string;

      status:
        string;

      verificationStatus:
        string;
    };

  return {
    id:
      record._id.toString(),

    businessName:
      record.businessName,

    displayName:
      record.businessDisplayName ||
      record.businessName,

    slug:
      record.slug,

    status:
      record.status,

    verificationStatus:
      record.verificationStatus,
  };
}

/* =========================================================
   CREATE PAYMENT
========================================================= */

export const createMerchantPaymentController =
  async (
    req:
      MerchantRequest,

    res:
      Response
  ): Promise<void> => {
    try {
      const merchant =
        req.merchant;

      if (
        !merchant?._id
      ) {
        res.status(
          401
        ).json({
          success:
            false,

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

      const idempotencyKey =
        stringValue(
          req.get(
            "Idempotency-Key"
          )
        );

      if (
        !idempotencyKey
      ) {
        res.status(
          400
        ).json({
          success:
            false,

          message:
            "Idempotency-Key header is required.",
        });

        return;
      }

      const result =
        await createWalletPayment({
          merchantId:
            merchant._id,

          customerId:
            optionalString(
              body.customerId
            ),

          amount:
            body.amount,

          currency:
            body.currency,

          orderId:
            optionalString(
              body.orderId
            ),

          merchantReference:
            optionalString(
              body.merchantReference
            ),

          returnUrl:
            optionalString(
              body.returnUrl
            ),

          cancelUrl:
            optionalString(
              body.cancelUrl
            ),

          mode:
            merchant.environment,

          idempotencyKey,
        });

      res.status(
        result.duplicate
          ? 200
          : 201
      ).json({
        success:
          true,

        duplicate:
          result.duplicate,

        message:
          result.duplicate
            ? "Existing Coffer payment returned successfully."
            : "Coffer payment created successfully.",

        payment: {
          ...serializePayment(
            result.payment
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
    } catch (
      error
    ) {
      console.error(
        "CREATE COFFER PAYMENT ERROR:",
        error
      );

      sendError(
        res,
        error,
        "Unable to create Coffer payment."
      );
    }
  };

/* =========================================================
   MERCHANT GET PAYMENT
========================================================= */

export const getMerchantPaymentController =
  async (
    req:
      MerchantRequest,

    res:
      Response
  ): Promise<void> => {
    try {
      const merchant =
        req.merchant;

      if (
        !merchant?._id
      ) {
        res.status(
          401
        ).json({
          success:
            false,

          message:
            "Merchant authentication required.",
        });

        return;
      }

      const paymentId =
        stringValue(
          req.params.paymentId
        );

      const payment =
        await getWalletPayment({
          paymentId,

          merchantId:
            merchant._id,
        });

      res.status(
        200
      ).json({
        success:
          true,

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
    } catch (
      error
    ) {
      sendError(
        res,
        error,
        "Unable to load merchant payment."
      );
    }
  };

/* =========================================================
   PUBLIC CHECKOUT

   NO LOGIN REQUIRED
========================================================= */

export const getCustomerCheckoutPaymentController =
  async (
    req:
      Request,

    res:
      Response
  ): Promise<void> => {
    try {
      const paymentId =
        stringValue(
          req.params.paymentId
        );

      if (!paymentId) {
        res.status(
          400
        ).json({
          success:
            false,

          message:
            "Payment ID is required.",
        });

        return;
      }

      const payment =
        await Payment.findOne({
          paymentId,
        }).lean();

      if (!payment) {
        res.status(
          404
        ).json({
          success:
            false,

          message:
            "Payment not found.",
        });

        return;
      }

      const merchant =
        await getCheckoutMerchant(
          payment.merchantId.toString()
        );

      const sandbox =
        payment.mode ===
        "test"
          ? getSandboxCheckoutCredentials()
          : null;

      res.status(
        200
      ).json({
        success:
          true,

        payment: {
          id:
            payment.paymentId,

          status:
            payment.status,

          amount:
            payment.amount.toString(),

          currency:
            payment.currency,

          merchantReference:
            payment.merchantReference,

          sourceType:
            payment.sourceType,

          provider:
            payment.provider,

          mode:
            payment.mode,

          returnUrl:
            payment.returnUrl,

          cancelUrl:
            payment.cancelUrl,

          createdAt:
            payment.createdAt,

          authorizedAt:
            payment.authorizedAt,

          capturedAt:
            payment.capturedAt,

          completedAt:
            payment.completedAt,

          merchant,

          /*
           * Sandbox credentials are intentionally visible
           * only on test-mode checkout.
           */
          sandbox:
            sandbox
              ? {
                  email:
                    sandbox.email,

                  phone:
                    sandbox.phone,

                  password:
                    sandbox.password,

                  otp:
                    sandbox.otp,

                  balance:
                    sandbox.balance,
                }
              : undefined,
        },
      });
    } catch (
      error
    ) {
      sendError(
        res,
        error,
        "Unable to load Coffer checkout."
      );
    }
  };

/* =========================================================
   PASSWORD + OTP REQUEST
========================================================= */

export const authenticateCheckoutCustomerController =
  async (
    req:
      Request,

    res:
      Response
  ): Promise<void> => {
    try {
      const paymentId =
        stringValue(
          req.params.paymentId
        );

      const result =
        await authenticateCheckoutCustomer({
          paymentId,

          identifier:
            req.body?.identifier,

          password:
            req.body?.password,
        });

      res.status(
        200
      ).json({
        success:
          true,

        message:
          result.mode ===
          "test"
            ? "Sandbox credentials verified."
            : "Password verified. Verification code sent.",

        ...result,
      });
    } catch (
      error
    ) {
      sendError(
        res,
        error,
        "Unable to verify checkout credentials."
      );
    }
  };

/* =========================================================
   OTP VERIFY
========================================================= */

export const verifyCheckoutOtpController =
  async (
    req:
      Request,

    res:
      Response
  ): Promise<void> => {
    try {
      const paymentId =
        stringValue(
          req.params.paymentId
        );

      const result =
        await verifyCheckoutOtp({
          paymentId,

          challengeId:
            req.body?.challengeId,

          otp:
            req.body?.otp,
        });

      res.status(
        200
      ).json({
        success:
          true,

        message:
          "Checkout verification completed.",

        ...result,
      });
    } catch (
      error
    ) {
      sendError(
        res,
        error,
        "Unable to verify checkout OTP."
      );
    }
  };

/* =========================================================
   CONFIRM PAYMENT

   Password + OTP checkout token required.
   Passkey is NOT mandatory.
========================================================= */

export const confirmMerchantWalletPaymentController =
  async (
    req:
      Request,

    res:
      Response
  ): Promise<void> => {
    try {
      const paymentId =
        stringValue(
          req.params.paymentId
        );

      const checkoutToken =
        stringValue(
          req.get(
            "X-Checkout-Token"
          )
        );

      if (
        !checkoutToken
      ) {
        res.status(
          401
        ).json({
          success:
            false,

          code:
            "CHECKOUT_VERIFICATION_REQUIRED",

          message:
            "Password and OTP verification is required before payment.",
        });

        return;
      }

      const verified =
        verifyCheckoutToken({
          token:
            checkoutToken,

          paymentId,
        });

      const payment =
        await Payment.findOne({
          paymentId,
        }).select(
          "paymentId mode status"
        );

      if (!payment) {
        res.status(
          404
        ).json({
          success:
            false,

          message:
            "Payment not found.",
        });

        return;
      }

      if (
        payment.mode !==
        verified.mode
      ) {
        res.status(
          401
        ).json({
          success:
            false,

          message:
            "Checkout verification does not match this payment.",
        });

        return;
      }

      /* ===================================================
         TEST

         Never touches real wallet.
      =================================================== */

      if (
        payment.mode ===
        "test"
      ) {
        const result =
          await confirmSandboxPayment({
            paymentId,
          });

        res.status(
          200
        ).json({
          success:
            true,

          duplicate:
            result.duplicate,

          message:
            result.duplicate
              ? "Sandbox payment was already completed."
              : "Sandbox payment completed successfully.",

          payment:
            serializePayment(
              result.payment
            ),

          wallet:
            result.wallet,
        });

        return;
      }

      /* ===================================================
         LIVE
      =================================================== */

      const customerId =
        verified.userId;

      if (
        !customerId
      ) {
        res.status(
          401
        ).json({
          success:
            false,

          message:
            "Checkout verification is invalid.",
        });

        return;
      }

      /*
       * Re-check KYC immediately before money movement.
       */
      await assertLiveCustomerKyc(
        customerId
      );

      const result =
        await confirmWalletPayment({
          paymentId,

          customerId,
        });

      res.status(
        200
      ).json({
        success:
          true,

        duplicate:
          result.duplicate,

        message:
          result.duplicate
            ? "Payment was already completed."
            : "Payment completed successfully.",

        payment:
          serializePayment(
            result.payment
          ),

        ...(result.wallet
          ? {
              wallet:
                result.wallet,
            }
          : {}),
      });
    } catch (
      error
    ) {
      console.error(
        "CONFIRM COFFER PAYMENT ERROR:",
        error
      );

      sendError(
        res,
        error,
        "Unable to complete Coffer payment."
      );
    }
  };

export default {
  createMerchantPaymentController,
  getMerchantPaymentController,
  getCustomerCheckoutPaymentController,
  authenticateCheckoutCustomerController,
  verifyCheckoutOtpController,
  confirmMerchantWalletPaymentController,
};