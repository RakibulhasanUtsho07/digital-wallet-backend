import mongoose from "mongoose";

import {
  Payment,
} from "../../../models/Payment.js";

import type {
  AiOwnedPaymentEvidence,
  AiPaymentEvent,
  MerchantOwnedPaymentReader,
} from "../types/cofferAi.types.js";

/* =========================================================
   SAFE LEAN RECORD
========================================================= */

interface MerchantPaymentRecord {
  paymentId?: unknown;
  status?: unknown;
  currency?: unknown;
  failureCode?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  authorizedAt?: unknown;
  capturedAt?: unknown;
  completedAt?: unknown;
  failedAt?: unknown;
  cancelledAt?: unknown;
  expiredAt?: unknown;
}

/* =========================================================
   SAFE VALUE HELPERS
========================================================= */

function safeIdentifier(
  value: unknown,
): string | null {
  if (
    typeof value ===
    "string"
  ) {
    const normalized =
      value.trim();

    return normalized
      ? normalized
      : null;
  }

  if (
    value &&
    typeof value ===
      "object" &&
    "toString" in value &&
    typeof value.toString ===
      "function"
  ) {
    const normalized =
      value.toString().trim();

    return normalized &&
      normalized !==
        "[object Object]"
      ? normalized
      : null;
  }

  return null;
}

function safeCode(
  value: unknown,
): string | null {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const normalized =
    value.trim();

  return /^[a-zA-Z0-9_.:-]{1,100}$/.test(
    normalized,
  )
    ? normalized
    : null;
}

function safeCurrency(
  value: unknown,
): string | null {
  if (
    typeof value !==
      "string" ||
    !/^[a-zA-Z]{3}$/.test(
      value.trim(),
    )
  ) {
    return null;
  }

  return value
    .trim()
    .toUpperCase();
}

function safeDate(
  value: unknown,
): string | null {
  if (
    !(value instanceof Date) &&
    typeof value !==
      "string"
  ) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date.toISOString();
}

function failureCategory(
  code: string | null,
): string | null {
  if (
    code ===
    "insufficient_funds"
  ) {
    return "customer_action";
  }

  if (
    code ===
    "risk_blocked"
  ) {
    return "risk_control";
  }

  if (
    code ===
    "validation_error"
  ) {
    return "validation";
  }

  if (
    code ===
      "provider_error" ||
    code === "declined"
  ) {
    return "provider";
  }

  if (
    code === "cancelled" ||
    code === "expired"
  ) {
    return "lifecycle";
  }

  return null;
}

function pushEvent(
  events: AiPaymentEvent[],
  input: {
    code: string;
    status: string;
    at: unknown;
  },
): void {
  const at =
    safeDate(
      input.at,
    );

  if (!at) {
    return;
  }

  events.push({
    code:
      input.code,
    status:
      input.status,
    at,
  });
}

/* =========================================================
   MAP PAYMENT TO SAFE AI EVIDENCE
========================================================= */

function mapMerchantPayment(
  record:
    MerchantPaymentRecord,
): AiOwnedPaymentEvidence | null {
  const paymentId =
    safeIdentifier(
      record.paymentId,
    );
  const state =
    safeCode(
      record.status,
    );

  if (
    !paymentId ||
    !state
  ) {
    return null;
  }

  const events:
    AiPaymentEvent[] =
    [];

  pushEvent(
    events,
    {
      code:
        "payment.created",
      status:
        "pending",
      at:
        record.createdAt,
    },
  );

  const lifecycleEvents:
    Array<{
      code: string;
      status: string;
      at: unknown;
    }> = [
    {
      code:
        "payment.authorized",
      status:
        "authorized",
      at:
        record.authorizedAt,
    },
    {
      code:
        "payment.captured",
      status:
        "captured",
      at:
        record.capturedAt,
    },
    {
      code:
        "payment.completed",
      status:
        "completed",
      at:
        record.completedAt,
    },
    {
      code:
        "payment.failed",
      status:
        "failed",
      at:
        record.failedAt,
    },
    {
      code:
        "payment.cancelled",
      status:
        "cancelled",
      at:
        record.cancelledAt,
    },
    {
      code:
        "payment.expired",
      status:
        "expired",
      at:
        record.expiredAt,
    },
  ];

  for (
    const event of
    lifecycleEvents
  ) {
    pushEvent(
      events,
      event,
    );
  }

  if (
    events.every(
      (event) =>
        event.status !==
        state,
    )
  ) {
    pushEvent(
      events,
      {
        code:
          "payment.current_state",
        status:
          state,
        at:
          record.updatedAt,
      },
    );
  }

  events.sort(
    (
      left,
      right,
    ) =>
      left.at.localeCompare(
        right.at,
      ),
  );

  const failureCode =
    safeCode(
      record.failureCode,
    );

  return {
    subjectType:
      "gateway_payment",
    paymentId,
    state,

    /*
     * Payment.amount is Decimal128 major units. Diagnosis does not require
     * the amount, so V1 does not perform a currency-specific conversion or
     * expose financial values to the explanation layer.
     */
    amountMinor:
      null,

    currency:
      safeCurrency(
        record.currency,
      ),
    createdAt:
      safeDate(
        record.createdAt,
      ),
    updatedAt:
      safeDate(
        record.updatedAt,
      ),
    failureCode,
    failureCategory:
      failureCategory(
        failureCode,
      ),
    providerStatusCode:
      null,
    events,
  };
}

/* =========================================================
   MERCHANT-OWNED READER

   The payment reference and trusted merchant ObjectId are applied in the
   same MongoDB query. This prevents cross-merchant resource access.
========================================================= */

export const cofferMerchantPaymentReader:
  MerchantOwnedPaymentReader = {
  async findOwnedMerchantPaymentTimeline({
    paymentId,
    merchantId,
  }) {
    const normalizedPaymentId =
      paymentId.trim();
    const normalizedMerchantId =
      merchantId.trim();

    if (
      !normalizedPaymentId ||
      !mongoose.isValidObjectId(
        normalizedMerchantId,
      )
    ) {
      return null;
    }

    const payment =
      await Payment.findOne({
        paymentId:
          normalizedPaymentId,
        merchantId:
          new mongoose.Types.ObjectId(
            normalizedMerchantId,
          ),
      })
        .select(
          [
            "paymentId",
            "status",
            "currency",
            "failureCode",
            "createdAt",
            "updatedAt",
            "authorizedAt",
            "capturedAt",
            "completedAt",
            "failedAt",
            "cancelledAt",
            "expiredAt",
          ].join(" "),
        )
        .lean();

    return payment
      ? mapMerchantPayment(
          payment as unknown as
          MerchantPaymentRecord,
        )
      : null;
  },
};
