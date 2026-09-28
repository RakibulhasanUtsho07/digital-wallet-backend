import "dotenv/config";

import mongoose from "mongoose";

import connectDB from "../config/db.js";

import {
  Payment,
} from "../models/Payment.js";

import {
  PaymentAttempt,
} from "../models/PaymentAttempt.js";

/* =========================================================
   SOURCE PAYMENT

   Existing pending payment is used only to obtain:
   - merchantId
   - amount
   - currency

   The original payment is NEVER modified.
========================================================= */

const SOURCE_PAYMENT_ID =
  "pay_6aa84243b7d6e0dc85c121d2_mu1lncqg";

/* =========================================================
   SEED
========================================================= */

async function seedAiSupportFailedPayment():
  Promise<void> {
  try {
    /* =====================================================
       DATABASE
    ====================================================== */

    await connectDB();

    console.log(
      "✅ MongoDB connected"
    );

    /* =====================================================
       FIND SOURCE PAYMENT
    ====================================================== */

    const sourcePayment =
      await Payment.findOne({
        paymentId:
          SOURCE_PAYMENT_ID,
      });

    if (!sourcePayment) {
      throw new Error(
        `Source payment not found: ${SOURCE_PAYMENT_ID}`
      );
    }

    console.log(
      "✅ Source payment found:"
    );

    console.log({
      paymentId:
        sourcePayment.paymentId,

      status:
        sourcePayment.status,

      merchantId:
        sourcePayment.merchantId,

      customerId:
        sourcePayment.customerId,

      provider:
        sourcePayment.provider,

      sourceType:
        sourcePayment.sourceType,

      mode:
        sourcePayment.mode,
    });

    /* =====================================================
       UNIQUE TEST IDS
    ====================================================== */

    const unique =
      `${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;

    const failedPaymentId =
      `pay_ai_failed_${unique}`;

    const failedAttemptId =
      `att_ai_failed_${unique}`;

    /* =====================================================
       CREATE SYNTHETIC FAILED PAYMENT

       IMPORTANT:

       PaymentFailureCode supports:
       - provider_error
       - insufficient_funds
       - declined
       - cancelled
       - expired
       - validation_error
       - risk_blocked
       - unknown

       `provider_timeout` is intentionally NOT inserted
       because it is not valid in Payment.ts.
    ====================================================== */

    const failedPayment =
      await Payment.create({
        paymentId:
          failedPaymentId,

        merchantId:
          sourcePayment.merchantId,

        /*
         * customerId is optional in Payment schema.
         */
        ...(sourcePayment.customerId
          ? {
              customerId:
                sourcePayment.customerId,
            }
          : {}),

        amount:
          sourcePayment.amount,

        currency:
          sourcePayment.currency,

        /*
         * Keep this synthetic provider scenario separate
         * from the original wallet payment.
         */
        sourceType:
          "local_psp",

        provider:
          "test_provider",

        /*
         * Never pollute live analytics with this seed.
         */
        mode:
          "test",

        status:
          "failed",

        /*
         * Valid Payment failure code.
         */
        failureCode:
          "provider_error",

        failureMessage:
          "Provider request timed out during payment processing.",

        failedAt:
          new Date(),
      });

    console.log(
      "✅ Synthetic failed payment created"
    );

    /* =====================================================
       CREATE MATCHING PAYMENT ATTEMPT

       PaymentAttempt supports the more specific:
       failureCode = timeout
    ====================================================== */

    const failedAttempt =
      await PaymentAttempt.create({
        attemptId:
          failedAttemptId,

        paymentId:
          failedPayment._id,

        merchantId:
          failedPayment.merchantId,

        provider:
          failedPayment.provider,

        operation:
          "create",

        status:
          "failed",

        failureCode:
          "timeout",

        failureMessage:
          "Provider request timed out before completing the payment request.",

        attemptNumber:
          1,

        startedAt:
          new Date(
            Date.now() -
              5_000
          ),

        completedAt:
          new Date(),

        metadata: {
          synthetic:
            true,

          purpose:
            "coffer_ai_support_testing",

          scenario:
            "provider_timeout",
        },
      });

    /* =====================================================
       RESULT
    ====================================================== */

    console.log(
      "\n=============================================="
    );

    console.log(
      "✅ COFFER AI SUPPORT TEST PAYMENT READY"
    );

    console.log(
      "=============================================="
    );

    console.log(
      `Source Payment : ${SOURCE_PAYMENT_ID}`
    );

    console.log(
      `Test Payment   : ${failedPayment.paymentId}`
    );

    console.log(
      `Attempt ID     : ${failedAttempt.attemptId}`
    );

    console.log(
      `Provider       : ${failedPayment.provider}`
    );

    console.log(
      "Payment Status : failed"
    );

    console.log(
      "Payment Cause  : provider_error"
    );

    console.log(
      "Attempt Cause  : timeout"
    );

    console.log(
      "Mode           : test"
    );

    console.log(
      "==============================================\n"
    );
  } catch (error) {
    console.error(
      "❌ Failed payment seed error:",
      error instanceof Error
        ? error.message
        : error
    );

    process.exitCode =
      1;
  } finally {
    await mongoose
      .disconnect()
      .catch(
        () => undefined
      );
  }
}

void seedAiSupportFailedPayment();