import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

import type {
  PaymentMode,
} from "./Payment.js";

/* =========================================================
   TYPES
========================================================= */

export type RefundStatus =
  | "pending"
  | "completed"
  | "failed"
  | "cancelled";

export type RefundFailureCode =
  | "payment_not_found"
  | "payment_not_refundable"
  | "refund_amount_exceeded"
  | "wallet_not_found"
  | "ledger_error"
  | "provider_error"
  | "unknown";

/* =========================================================
   REFUND DOCUMENT
========================================================= */

export interface IRefund
  extends Document {
  refundId: string;

  merchantId:
    mongoose.Types.ObjectId;

  /*
   * Internal MongoDB Payment reference.
   */
  paymentId:
    mongoose.Types.ObjectId;

  /*
   * Public payment ID.
   *
   * Example:
   * pay_xxxxx
   */
  paymentReference: string;

  customerId:
    mongoose.Types.ObjectId;

  amount:
    mongoose.Types.Decimal128;

  /*
   * Exact amount in minor units.
   *
   * BDT 100.50 = 10050
   */
  amountMinor: number;

  currency: string;

  mode:
    PaymentMode;

  status:
    RefundStatus;

  reason?: string;

  merchantReference?: string;

  idempotencyKey: string;

  ledgerEntryGroupId?: string;

  failureCode?:
    RefundFailureCode;

  failureMessage?: string;

  /*
   * Settlement reconciliation.
   *
   * When a completed refund is included in a settlement,
   * this field stores the MongoDB Settlement _id.
   *
   * This prevents the same refund from being allocated
   * to multiple settlements.
   */
  settlementId?:
    mongoose.Types.ObjectId;

  /*
   * Timestamp indicating when the refund was allocated
   * to a settlement.
   */
  settledAt?: Date;

  completedAt?: Date;

  failedAt?: Date;

  cancelledAt?: Date;

  createdAt: Date;

  updatedAt: Date;
}

/* =========================================================
   SCHEMA
========================================================= */

const refundSchema =
  new Schema<IRefund>(
    {
      refundId: {
        type: String,
        required: true,
        trim: true,
        immutable: true,
        minlength: 10,
        maxlength: 120,
      },

      merchantId: {
        type:
          Schema.Types.ObjectId,

        ref:
          "Merchant",

        required: true,

        index: true,
      },

      paymentId: {
        type:
          Schema.Types.ObjectId,

        ref:
          "Payment",

        required: true,

        index: true,
      },

      paymentReference: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
        index: true,
      },

      customerId: {
        type:
          Schema.Types.ObjectId,

        ref:
          "User",

        required: true,

        index: true,
      },

      amount: {
        type:
          Schema.Types.Decimal128,

        required: true,

        validate: {
          validator: (
            value:
              mongoose.Types.Decimal128
          ): boolean => {
            return (
              Number(
                value.toString()
              ) > 0
            );
          },

          message:
            "Refund amount must be greater than zero.",
        },
      },

      amountMinor: {
        type: Number,
        required: true,
        min: 1,
      },

      currency: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        minlength: 3,
        maxlength: 3,
      },

      mode: {
        type: String,

        enum: [
          "test",
          "live",
        ],

        required: true,

        index: true,
      },

      status: {
        type: String,

        enum: [
          "pending",
          "completed",
          "failed",
          "cancelled",
        ],

        required: true,

        default:
          "pending",

        index: true,
      },

      reason: {
        type: String,
        trim: true,
        maxlength: 500,
        default: undefined,
      },

      merchantReference: {
        type: String,
        trim: true,
        maxlength: 150,
        default: undefined,
      },

      idempotencyKey: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200,
        select: false,
      },

      ledgerEntryGroupId: {
        type: String,
        trim: true,
        maxlength: 120,
        default: undefined,
      },

      failureCode: {
        type: String,

        enum: [
          "payment_not_found",
          "payment_not_refundable",
          "refund_amount_exceeded",
          "wallet_not_found",
          "ledger_error",
          "provider_error",
          "unknown",
        ],

        default: undefined,
      },

      failureMessage: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: undefined,
      },

      /*
       * =====================================================
       * SETTLEMENT RECONCILIATION
       * =====================================================
       */

      settlementId: {
        type:
          Schema.Types.ObjectId,

        ref:
          "Settlement",

        default: undefined,

        index: true,
      },

      settledAt: {
        type: Date,

        default: undefined,

        index: true,
      },

      completedAt: {
        type: Date,
        default: undefined,
      },

      failedAt: {
        type: Date,
        default: undefined,
      },

      cancelledAt: {
        type: Date,
        default: undefined,
      },
    },
    {
      timestamps: true,
      versionKey: false,
      strict: true,
    }
  );

/* =========================================================
   INDEXES
========================================================= */

refundSchema.index(
  {
    refundId: 1,
  },
  {
    unique: true,
    name:
      "unique_refund_id",
  }
);

refundSchema.index(
  {
    merchantId: 1,
    mode: 1,
    idempotencyKey: 1,
  },
  {
    unique: true,
    name:
      "unique_refund_idempotency",
  }
);

refundSchema.index(
  {
    paymentId: 1,
    status: 1,
    createdAt: -1,
  },
  {
    name:
      "refund_payment_status_created",
  }
);

refundSchema.index(
  {
    merchantId: 1,
    status: 1,
    createdAt: -1,
  },
  {
    name:
      "refund_merchant_status_created",
  }
);

/*
 * Fast lookup of refunds waiting for settlement
 * reconciliation.
 */
refundSchema.index(
  {
    merchantId: 1,
    currency: 1,
    status: 1,
    settlementId: 1,
    createdAt: 1,
  },
  {
    name:
      "refund_settlement_reconciliation",
  }
);

/*
 * Prevent accidental multiple settlement timestamps
 * from becoming expensive to search later.
 */
refundSchema.index(
  {
    settlementId: 1,
    settledAt: 1,
  },
  {
    name:
      "refund_settlement_lookup",
  }
);

/* =========================================================
   MODEL
========================================================= */

const RefundModel:
  Model<IRefund> =
  (
    mongoose.models
      .Refund as
      Model<IRefund>
  ) ||
  mongoose.model<IRefund>(
    "Refund",
    refundSchema
  );

export const Refund =
  RefundModel;

export default RefundModel;