import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

/* =========================================================
   TYPES
========================================================= */

export type SettlementStatus =
  | "pending"
  | "processing"
  | "settled"
  | "failed"
  | "cancelled";

/* =========================================================
   SETTLEMENT
========================================================= */

export interface ISettlement
  extends Document {
  /* =======================================================
     IDENTIFIERS
  ======================================================== */

  settlementId: string;

  merchantId: mongoose.Types.ObjectId;

  /* =======================================================
     PERIOD
  ======================================================== */

  periodStart: Date;

  periodEnd: Date;

  /* =======================================================
     CURRENCY
  ======================================================== */

  currency: string;

  /* =======================================================
     PAYMENT SUMMARY
  ======================================================== */

  paymentCount: number;

  grossAmount: mongoose.Types.Decimal128;

  feeAmount: mongoose.Types.Decimal128;

  refundAmount: mongoose.Types.Decimal128;

  adjustmentAmount: mongoose.Types.Decimal128;

  netAmount: mongoose.Types.Decimal128;

  /* =======================================================
     STATUS
  ======================================================== */

  status: SettlementStatus;

  /* =======================================================
     PAYOUT REFERENCE
  ======================================================== */

  payoutId?: string;

  /* =======================================================
     NOTES
  ======================================================== */

  note?: string;

  failureReason?: string;

  /* =======================================================
     TIMESTAMPS
  ======================================================== */

  settledAt?: Date;

  createdAt: Date;

  updatedAt: Date;
}

/* =========================================================
   SCHEMA
========================================================= */

const settlementSchema =
  new Schema<ISettlement>(
    {
      /* =====================================================
         SETTLEMENT ID
      ====================================================== */

      settlementId: {
        type: String,

        required: true,

        unique: true,

        trim: true,

        immutable: true,

        index: true,

        minlength: 10,

        maxlength: 120,
      },

      /* =====================================================
         MERCHANT
      ====================================================== */

      merchantId: {
        type: Schema.Types.ObjectId,

        ref: "Merchant",

        required: true,

        index: true,
      },

      /* =====================================================
         PERIOD
      ====================================================== */

      periodStart: {
        type: Date,

        required: true,

        index: true,
      },

      periodEnd: {
        type: Date,

        required: true,

        index: true,
      },

      /* =====================================================
         CURRENCY
      ====================================================== */

      currency: {
        type: String,

        required: true,

        trim: true,

        uppercase: true,

        minlength: 3,

        maxlength: 3,

        index: true,
      },

      /* =====================================================
         PAYMENT SUMMARY
      ====================================================== */

      paymentCount: {
        type: Number,

        required: true,

        min: 0,

        default: 0,
      },

      grossAmount: {
        type: Schema.Types.Decimal128,

        required: true,

        default: "0.00",
      },

      feeAmount: {
        type: Schema.Types.Decimal128,

        required: true,

        default: "0.00",
      },

      refundAmount: {
        type: Schema.Types.Decimal128,

        required: true,

        default: "0.00",
      },

      adjustmentAmount: {
        type: Schema.Types.Decimal128,

        required: true,

        default: "0.00",
      },

      netAmount: {
        type: Schema.Types.Decimal128,

        required: true,

        default: "0.00",
      },

      /* =====================================================
         STATUS
      ====================================================== */

      status: {
        type: String,

        enum: [
          "pending",
          "processing",
          "settled",
          "failed",
          "cancelled",
        ],

        required: true,

        default: "pending",

        index: true,
      },

      /* =====================================================
         PAYOUT
      ====================================================== */

      payoutId: {
        type: String,

        trim: true,

        maxlength: 120,

        default: undefined,

        index: true,
      },

      /* =====================================================
         NOTES
      ====================================================== */

      note: {
        type: String,

        trim: true,

        maxlength: 1000,

        default: undefined,
      },

      failureReason: {
        type: String,

        trim: true,

        maxlength: 1000,

        default: undefined,
      },

      /* =====================================================
         SETTLED AT
      ====================================================== */

      settledAt: {
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

/*
 * Merchant settlement history.
 */
settlementSchema.index(
  {
    merchantId: 1,

    createdAt: -1,
  },
  {
    name:
      "settlement_merchant_created_at",
  }
);

/*
 * Merchant + status filtering.
 */
settlementSchema.index(
  {
    merchantId: 1,

    status: 1,

    createdAt: -1,
  },
  {
    name:
      "settlement_merchant_status_created_at",
  }
);

/*
 * Merchant period lookup.
 */
settlementSchema.index(
  {
    merchantId: 1,

    periodStart: 1,

    periodEnd: 1,

    currency: 1,
  },
  {
    unique: true,

    name:
      "unique_merchant_settlement_period",
  }
);

/*
 * Payout lookup.
 */
settlementSchema.index(
  {
    payoutId: 1,
  },
  {
    sparse: true,

    name:
      "settlement_payout_reference",
  }
);

/* =========================================================
   SAFE OBJECT OUTPUT
========================================================= */

settlementSchema.set(
  "toJSON",
  {
    virtuals: true,
  }
);

settlementSchema.set(
  "toObject",
  {
    virtuals: true,
  }
);

/* =========================================================
   MODEL
========================================================= */

const SettlementModel:
  Model<ISettlement> =
  (mongoose.models.Settlement as Model<ISettlement>) ||
  mongoose.model<ISettlement>(
    "Settlement",
    settlementSchema
  );

/* =========================================================
   EXPORTS
========================================================= */

export const Settlement =
  SettlementModel;

export default SettlementModel;