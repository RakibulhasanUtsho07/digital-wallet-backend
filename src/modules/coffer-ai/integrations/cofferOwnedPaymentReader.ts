import mongoose from "mongoose";

import {
  Payment,
} from "../../../models/Payment.js";

import {
  Transaction,
} from "../../../models/Transaction.js";

import type {
  AiOwnedPaymentEvidence,
  AiPaymentEvent,
  OwnedPaymentReader,
} from "../types/cofferAi.types.js";

/* =========================================================
   SAFE LEAN RECORDS
========================================================= */

interface GatewayPaymentRecord {
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

interface WalletTransactionRecord {
  _id?: unknown;
  status?: unknown;
  currency?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/* =========================================================
   SAFE VALUE HELPERS
========================================================= */

function safeCode(
  value: unknown,
): string | null {
  if (
    typeof value !== "string"
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
    typeof value !== "string" ||
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
    typeof value !== "string"
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

function safeIdentifier(
  value: unknown,
): string | null {
  if (
    typeof value === "string"
  ) {
    const normalized =
      value.trim();

    return normalized
      ? normalized
      : null;
  }

  if (
    value &&
    typeof value === "object" &&
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
    code === "risk_blocked"
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
    code === "provider_error" ||
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

/* =========================================================
   PAYMENT MAPPING
========================================================= */

function mapGatewayPayment(
  record: GatewayPaymentRecord,
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
     * Payment.amount uses Decimal128 major units while the shared evidence
     * contract uses minor units. V1 deliberately omits the amount instead of
     * making a lossy or currency-specific conversion.
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
   WALLET TRANSACTION MAPPING
========================================================= */

function mapWalletTransaction(
  record: WalletTransactionRecord,
): AiOwnedPaymentEvidence | null {
  const paymentId =
    safeIdentifier(
      record._id,
    );
  const rawState =
    safeCode(
      record.status,
    );
  const state =
    rawState
      ?.toLowerCase() ??
    null;

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
        "transaction.created",
      status:
        state,
      at:
        record.createdAt,
    },
  );

  const updatedAt =
    safeDate(
      record.updatedAt,
    );
  const createdAt =
    safeDate(
      record.createdAt,
    );

  if (
    updatedAt &&
    updatedAt !==
      createdAt
  ) {
    events.push({
      code:
        "transaction.current_state",
      status:
        state,
      at:
        updatedAt,
    });
  }

  return {
    subjectType:
      "wallet_transaction",
    paymentId,
    state,

    /*
     * The wallet amount is encrypted. Diagnosis does not need it, so V1 does
     * not decrypt or expose it.
     */
    amountMinor:
      null,

    currency:
      safeCurrency(
        record.currency,
      ),

    createdAt,
    updatedAt,

    /*
     * Transaction currently stores no deterministic failure reason. A FAILED
     * status therefore remains partial/unknown instead of being invented.
     */
    failureCode:
      null,
    failureCategory:
      null,
    providerStatusCode:
      null,
    events,
  };
}

/* =========================================================
   OWNER-SCOPED READER
========================================================= */

export const cofferOwnedPaymentReader:
  OwnedPaymentReader = {
  async findOwnedPaymentTimeline({
    paymentId,
    userId,
  }) {
    const normalizedPaymentId =
      paymentId.trim();
    const normalizedUserId =
      userId.trim();

    if (
      !normalizedPaymentId ||
      !mongoose.isValidObjectId(
        normalizedUserId,
      )
    ) {
      return null;
    }

    const ownerObjectId =
      new mongoose.Types.ObjectId(
        normalizedUserId,
      );

    /* =====================================================
       GATEWAY PAYMENT

       Ownership is enforced in the database query itself.
    ====================================================== */

    const gatewayPayment =
      await Payment.findOne({
        paymentId:
          normalizedPaymentId,
        customerId:
          ownerObjectId,
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

    if (gatewayPayment) {
      return mapGatewayPayment(
        gatewayPayment as unknown as GatewayPaymentRecord,
      );
    }

    /* =====================================================
       WALLET TRANSACTION

       Transaction IDs are MongoDB ObjectIds. Ownership is checked in the
       same query through senderId/receiverId.
    ====================================================== */

    if (
      !mongoose.isValidObjectId(
        normalizedPaymentId,
      )
    ) {
      return null;
    }

    const transaction =
      await Transaction.findOne({
        _id:
          new mongoose.Types.ObjectId(
            normalizedPaymentId,
          ),
        $or: [
          {
            senderId:
              ownerObjectId,
          },
          {
            receiverId:
              ownerObjectId,
          },
        ],
      })
        .select(
          "_id status currency createdAt updatedAt",
        )
        .lean();

    return transaction
      ? mapWalletTransaction(
          transaction as unknown as WalletTransactionRecord,
        )
      : null;
  },
};
