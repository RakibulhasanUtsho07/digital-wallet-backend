import mongoose, {
  type ClientSession,
} from "mongoose";

import {
  Payment,
} from "../models/Payment.js";

import {
  Merchant,
} from "../models/Merchant.js";

import {
  Order,
} from "../models/Order.js";

import {
  transitionPayment,
} from "./paymentLifecycleService.js";

import {
  createPaymentWebhookEvents,
} from "./webhookService.js";

import {
  getSandboxCheckoutCredentials,
} from "./checkoutVerificationService.js";

/* =========================================================
   HELPERS
========================================================= */

function normalizePaymentId(
  value: string,
): string {
  const paymentId =
    typeof value ===
    "string"
      ? value.trim()
      : "";

  if (!paymentId) {
    throw new Error(
      "Payment ID is required.",
    );
  }

  return paymentId;
}

/* =========================================================
   SANDBOX BALANCE
========================================================= */

function getSandboxBalance():
  number {
  const sandbox =
    getSandboxCheckoutCredentials();

  const balance =
    Number(
      sandbox.balance,
    );

  if (
    !Number.isFinite(
      balance,
    ) ||
    balance < 0
  ) {
    throw new Error(
      "Sandbox balance configuration is invalid.",
    );
  }

  return balance;
}

/* =========================================================
   SYNC LINKED ORDER → PAID

   Payment.orderId contains the MongoDB ObjectId of Order.

   We update only TEST orders that are still in an open
   state. We never downgrade/overwrite refunded, cancelled,
   expired or other final order states.
========================================================= */

async function markLinkedSandboxOrderPaid({
  payment,
  session,
}: {
  payment:
    InstanceType<
      typeof Payment
    >;

  session:
    ClientSession;
}): Promise<void> {
  if (
    !payment.orderId
  ) {
    return;
  }

  const paidAt =
    payment.completedAt ??
    new Date();

  await Order.findOneAndUpdate(
    {
      _id:
        payment.orderId,

      merchantId:
        payment.merchantId,

      mode:
        "test",

      status: {
        $in: [
          "created",
          "pending",
        ],
      },
    },

    {
      $set: {
        status:
          "paid",

        paidAt,
      },
    },

    {
      session,

      runValidators:
        true,
    },
  );
}

/* =========================================================
   SYNC LINKED ORDER → FAILED

   Order currently has no failedAt field, so only its
   lifecycle status is changed.
========================================================= */

async function markLinkedSandboxOrderFailed({
  payment,
  session,
}: {
  payment:
    InstanceType<
      typeof Payment
    >;

  session:
    ClientSession;
}): Promise<void> {
  if (
    !payment.orderId
  ) {
    return;
  }

  await Order.findOneAndUpdate(
    {
      _id:
        payment.orderId,

      merchantId:
        payment.merchantId,

      mode:
        "test",

      status: {
        $in: [
          "created",
          "pending",
        ],
      },
    },

    {
      $set: {
        status:
          "failed",
      },
    },

    {
      session,

      runValidators:
        true,
    },
  );
}

/* =========================================================
   WEBHOOK PAYLOAD
========================================================= */

function buildWebhookPayment(
  payment:
    InstanceType<
      typeof Payment
    >,
) {
  return {
    paymentId:
      payment.paymentId,

    merchantId:
      payment.merchantId.toString(),

    mode:
      payment.mode,

    amount:
      payment.amount,

    currency:
      payment.currency,

    customerId:
      payment.customerId
        ?.toString(),

    orderId:
      payment.orderId
        ?.toString(),

    merchantReference:
      payment.merchantReference,

    status:
      payment.status,

    provider:
      payment.provider,

    sourceType:
      payment.sourceType,

    createdAt:
      payment.createdAt,

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
   CONFIRM SANDBOX PAYMENT
========================================================= */

export async function confirmSandboxPayment({
  paymentId,
}: {
  paymentId: string;
}) {
  const normalizedPaymentId =
    normalizePaymentId(
      paymentId,
    );

  /* =======================================================
     INITIAL PAYMENT LOOKUP
  ======================================================== */

  const initialPayment =
    await Payment.findOne({
      paymentId:
        normalizedPaymentId,
    });

  if (
    !initialPayment
  ) {
    throw new Error(
      "Payment not found.",
    );
  }

  /* =======================================================
     TEST ONLY
  ======================================================== */

  if (
    initialPayment.mode !==
    "test"
  ) {
    throw new Error(
      "Sandbox confirmation is available only for test payments.",
    );
  }

  /* =======================================================
     MERCHANT
  ======================================================== */

  const merchant =
    await Merchant.findById(
      initialPayment.merchantId,
    )
      .select(
        "status testEnabled",
      )
      .lean();

  if (!merchant) {
    throw new Error(
      "Merchant account not found.",
    );
  }

  const merchantAllowed =
    merchant.status ===
      "pending" ||
    merchant.status ===
      "active";

  if (
    !merchantAllowed
  ) {
    throw new Error(
      "Merchant account is not available for test payments.",
    );
  }

  if (
    merchant.testEnabled !==
    true
  ) {
    throw new Error(
      "Test payment access is not enabled for this merchant.",
    );
  }

  /* =======================================================
     SANDBOX BALANCE
  ======================================================== */

  const sandboxBalance =
    getSandboxBalance();

  const amount =
    Number(
      initialPayment
        .amount
        .toString(),
    );

  if (
    !Number.isFinite(
      amount,
    ) ||
    amount <= 0
  ) {
    throw new Error(
      "Sandbox payment amount is invalid.",
    );
  }

  /* =======================================================
     DATABASE TRANSACTION

     Payment state + linked Order state stay consistent.
  ======================================================== */

  const session =
    await mongoose.startSession();

  let finalPayment:
    InstanceType<
      typeof Payment
    >;

  let duplicate =
    false;

  try {
    session.startTransaction();

    /*
     * Re-read payment inside the transaction.
     *
     * This prevents us from blindly using stale state if two
     * confirmation requests arrive close together.
     */
    const payment =
      await Payment.findOne({
        paymentId:
          normalizedPaymentId,
      }).session(
        session,
      );

    if (!payment) {
      throw new Error(
        "Payment not found.",
      );
    }

    if (
      payment.mode !==
      "test"
    ) {
      throw new Error(
        "Sandbox confirmation is available only for test payments.",
      );
    }

    /* =====================================================
       ALREADY COMPLETED

       Repair an old stale linked Order if necessary.
    ====================================================== */

    if (
      payment.status ===
      "completed"
    ) {
      await markLinkedSandboxOrderPaid({
        payment,
        session,
      });

      finalPayment =
        payment;

      duplicate =
        true;

      await session.commitTransaction();
    }

    /* =====================================================
       FINAL NON-SUCCESS STATES
    ====================================================== */

    else if (
      payment.status ===
        "failed" ||
      payment.status ===
        "cancelled" ||
      payment.status ===
        "expired"
    ) {
      throw new Error(
        `Sandbox payment cannot be completed from status "${payment.status}".`,
      );
    }

    /* =====================================================
       BUG #2 FIX
       INSUFFICIENT SANDBOX BALANCE

       Important:
       Do this BEFORE authorization/capture.
    ====================================================== */

    else if (
      amount >
      sandboxBalance
    ) {
      /*
       * New sandbox confirmation normally starts from pending.
       *
       * The Payment lifecycle correctly allows:
       * pending -> failed
       */
      if (
        payment.status ===
        "pending"
      ) {
        const failedPayment =
          await transitionPayment({
            paymentId:
              payment.paymentId,

            nextStatus:
              "failed",

            failureCode:
              "insufficient_funds",

            failureMessage:
              "Insufficient sandbox balance.",

            session,
          });

        /*
         * Keep linked Order consistent with Payment.
         */
        await markLinkedSandboxOrderFailed({
          payment:
            failedPayment,

          session,
        });

        finalPayment =
          failedPayment;

        await session.commitTransaction();
      } else {
        /*
         * An already-authorized/captured payment should never
         * normally arrive here because the balance check is
         * performed before authorization.

         * Do not violate the Payment state machine by forcing
         * authorized/captured -> failed.
         */
        throw new Error(
          `Sandbox payment cannot fail for insufficient balance from status "${payment.status}".`,
        );
      }
    }

    /* =====================================================
       NORMAL SUCCESS FLOW
    ====================================================== */

    else {
      let currentPayment =
        payment;

      /* ===================================================
         PENDING → AUTHORIZED
      ==================================================== */

      if (
        currentPayment.status ===
        "pending"
      ) {
        currentPayment =
          await transitionPayment({
            paymentId:
              currentPayment.paymentId,

            nextStatus:
              "authorized",

            session,
          });
      }

      /* ===================================================
         AUTHORIZED → CAPTURED
      ==================================================== */

      if (
        currentPayment.status ===
        "authorized"
      ) {
        currentPayment =
          await transitionPayment({
            paymentId:
              currentPayment.paymentId,

            nextStatus:
              "captured",

            session,
          });
      }

      /* ===================================================
         CAPTURED → COMPLETED
      ==================================================== */

      if (
        currentPayment.status ===
        "captured"
      ) {
        currentPayment =
          await transitionPayment({
            paymentId:
              currentPayment.paymentId,

            nextStatus:
              "completed",

            session,
          });
      }

      if (
        currentPayment.status !==
        "completed"
      ) {
        throw new Error(
          `Sandbox payment cannot be completed from status "${currentPayment.status}".`,
        );
      }

      /* ===================================================
         BUG #3 FIX
         PAYMENT COMPLETED → ORDER PAID

         This is part of the same DB transaction.
      ==================================================== */

      await markLinkedSandboxOrderPaid({
        payment:
          currentPayment,

        session,
      });

      finalPayment =
        currentPayment;

      await session.commitTransaction();
    }
  } catch (
    error: unknown
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

  /* =======================================================
     INSUFFICIENT BALANCE RESULT

     At this point Payment + Order are already persisted as
     failed. We throw an error so checkout UI does not treat
     it as a successful payment.
  ======================================================== */

  if (
    finalPayment.status ===
      "failed" &&
    finalPayment.failureCode ===
      "insufficient_funds"
  ) {
    throw new Error(
      "Insufficient sandbox balance.",
    );
  }

  /* =======================================================
     SUCCESS WEBHOOK

     Payment + Order have already committed.

     Webhook failure must NEVER roll those states back.
  ======================================================== */

  if (
    !duplicate &&
    finalPayment.status ===
      "completed"
  ) {
    try {
      await createPaymentWebhookEvents({
        payment:
          buildWebhookPayment(
            finalPayment,
          ),

        eventType:
          "payment.completed",
      });
    } catch (
      webhookError
    ) {
      console.error(
        "SANDBOX PAYMENT WEBHOOK ERROR:",
        webhookError,
      );
    }
  }

  /* =======================================================
     RESULT

     IMPORTANT:
     This is only a simulated sandbox balance.

     No MongoDB Wallet is changed.
     No real customer wallet is debited.
     No live financial ledger is posted.
  ======================================================== */

  return {
    duplicate,

    payment:
      finalPayment,

    wallet: {
      balance:
        Math.max(
          0,
          sandboxBalance -
            amount,
        ),

      currency:
        finalPayment.currency,
    },
  };
}