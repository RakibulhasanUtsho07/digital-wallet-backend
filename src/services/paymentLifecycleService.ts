import type {
  ClientSession,
} from "mongoose";

import {
  Payment,
  type PaymentStatus,
  type PaymentFailureCode,
} from "../models/Payment.js";

/* =========================================================
   VALID TRANSITIONS
========================================================= */

const PAYMENT_TRANSITIONS:
  Record<
    PaymentStatus,
    readonly PaymentStatus[]
  > = {
  pending: [
    "authorized",
    "failed",
    "cancelled",
    "expired",
  ],

  authorized: [
    "captured",
  ],

  captured: [
    "completed",
  ],

  completed: [],

  failed: [],

  cancelled: [],

  expired: [],
};

/* =========================================================
   CHECK TRANSITION
========================================================= */

export const canTransitionPayment =
  (
    from: PaymentStatus,
    to: PaymentStatus
  ): boolean => {
    return (
      PAYMENT_TRANSITIONS[
        from
      ]?.includes(to) ??
      false
    );
  };

/* =========================================================
   TRANSITION PAYMENT
========================================================= */

export const transitionPayment =
  async ({
    paymentId,
    nextStatus,
    failureCode,
    failureMessage,
    session,
  }: {
    paymentId: string;
    nextStatus: PaymentStatus;
    failureCode?: PaymentFailureCode;
    failureMessage?: string;
    session?: ClientSession;
  }) => {
    const payment =
      await Payment.findOne({
        paymentId,
      })
        .session(
          session ?? null
        );

    if (!payment) {
      throw new Error(
        "Payment not found."
      );
    }

    const currentStatus =
      payment.status;

    if (
      !canTransitionPayment(
        currentStatus,
        nextStatus
      )
    ) {
      throw new Error(
        `Invalid payment transition: ${currentStatus} -> ${nextStatus}.`
      );
    }

    /* =====================================================
       TIMESTAMP
    ====================================================== */

    const now =
      new Date();

    /* =====================================================
       STATUS
    ====================================================== */

    payment.status =
      nextStatus;

    /* =====================================================
       AUTHORIZED
    ====================================================== */

    if (
      nextStatus ===
      "authorized"
    ) {
      payment.authorizedAt =
        now;
    }

    /* =====================================================
       CAPTURED
    ====================================================== */

    if (
      nextStatus ===
      "captured"
    ) {
      payment.capturedAt =
        now;
    }

    /* =====================================================
       COMPLETED
    ====================================================== */

    if (
      nextStatus ===
      "completed"
    ) {
      payment.completedAt =
        now;
    }

    /* =====================================================
       FAILED
    ====================================================== */

    if (
      nextStatus ===
      "failed"
    ) {
      payment.failedAt =
        now;

      payment.failureCode =
        failureCode ??
        "unknown";

      payment.failureMessage =
        failureMessage;
    }

    /* =====================================================
       CANCELLED
    ====================================================== */

    if (
      nextStatus ===
      "cancelled"
    ) {
      payment.cancelledAt =
        now;

      payment.failureCode =
        failureCode ??
        "cancelled";

      payment.failureMessage =
        failureMessage;
    }

    /* =====================================================
       EXPIRED
    ====================================================== */

    if (
      nextStatus ===
      "expired"
    ) {
      payment.expiredAt =
        now;

      payment.failureCode =
        "expired";

      payment.failureMessage =
        failureMessage ??
        "Payment expired.";
    }

    await payment.save({
      session,
    });

    return payment;
  };