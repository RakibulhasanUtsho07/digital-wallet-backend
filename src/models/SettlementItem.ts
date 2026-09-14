import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

/* =========================================================
   TYPES
========================================================= */

export type SettlementItemStatus =
  | "allocated"
  | "released";

/* =========================================================
   SETTLEMENT ITEM
========================================================= */

export interface ISettlementItem
  extends Document {
  /* =======================================================
     IDENTIFIERS
  ======================================================== */

  settlementId: mongoose.Types.ObjectId;

  settlementPublicId: string;

  paymentId: string;

  merchantId: mongoose.Types.ObjectId;

  /* =======================================================
     PAYMENT SNAPSHOT
  ======================================================== */

  amount: mongoose.Types.Decimal128;

  feeAmount: mongoose.Types.Decimal128;

  netAmount: mongoose.Types.Decimal128;

  currency: string;

  completedAt: Date;

  /* =======================================================
     STATUS
  ======================================================== */

  status: SettlementItemStatus;

  /* =======================================================
     TIMESTAMPS
  ======================================================== */

  allocatedAt: Date;

  releasedAt?: Date;

  createdAt: Date;

  updatedAt: Date;
}

/* =========================================================
   SCHEMA
========================================================= */

const settlementItemSchema =
  new Schema<ISettlementItem>(
    {
      /* =====================================================
         SETTLEMENT
      ====================================================== */

      settlementId: {
        type: Schema.Types.ObjectId,

        ref: "Settlement",

        required: true,

        index: true,
      },

      settlementPublicId: {
        type: String,

        required: true,

        trim: true,

        immutable: true,

        index: true,

        minlength: 10,

        maxlength: 120,
      },

      /* =====================================================
         PAYMENT
      ====================================================== */

      paymentId: {
        type: String,

        required: true,

        trim: true,

        immutable: true,

        minlength: 10,

        maxlength: 120,

        index: true,
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
         PAYMENT SNAPSHOT
      ====================================================== */

      amount: {
        type: Schema.Types.Decimal128,

        required: true,

        default: "0.00",
      },

      feeAmount: {
        type: Schema.Types.Decimal128,

        required: true,

        default: "0.00",
      },

      netAmount: {
        type: Schema.Types.Decimal128,

        required: true,

        default: "0.00",
      },

      currency: {
        type: String,

        required: true,

        trim: true,

        uppercase: true,

        minlength: 3,

        maxlength: 3,

        index: true,
      },

      completedAt: {
        type: Date,

        required: true,

        index: true,
      },

      /* =====================================================
         STATUS
      ====================================================== */

      status: {
        type: String,

        enum: [
          "allocated",
          "released",
        ],

        required: true,

        default: "allocated",

        index: true,
      },

      /* =====================================================
         ALLOCATION
      ====================================================== */

      allocatedAt: {
        type: Date,

        required: true,

        default: Date.now,
      },

      releasedAt: {
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
 * A payment can belong to only one active settlement.
 *
 * This is the most important protection against
 * double-settlement.
 */
settlementItemSchema.index(
  {
    paymentId: 1,
  },
  {
    unique: true,

    name:
      "unique_settlement_payment",
  }
);

/*
 * Settlement item history.
 */
settlementItemSchema.index(
  {
    settlementId: 1,

    status: 1,

    createdAt: -1,
  },
  {
    name:
      "settlement_item_settlement_status",
  }
);

/*
 * Merchant settlement allocation lookup.
 */
settlementItemSchema.index(
  {
    merchantId: 1,

    currency: 1,

    status: 1,

    completedAt: 1,
  },
  {
    name:
      "settlement_item_merchant_currency_status_completed",
  }
);

/* =========================================================
   SAFE OUTPUT
========================================================= */

settlementItemSchema.set(
  "toJSON",
  {
    virtuals: true,
  }
);

settlementItemSchema.set(
  "toObject",
  {
    virtuals: true,
  }
);

/* =========================================================
   MODEL
========================================================= */

const SettlementItemModel:
  Model<ISettlementItem> =
  (mongoose.models
    .SettlementItem as Model<ISettlementItem>) ||
  mongoose.model<ISettlementItem>(
    "SettlementItem",
    settlementItemSchema
  );

/* =========================================================
   EXPORTS
========================================================= */

export const SettlementItem =
  SettlementItemModel;

export default SettlementItemModel;