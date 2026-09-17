import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

/* =========================================================
   TYPES
========================================================= */

export type PayoutStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type PayoutMethod =
  | "bank"
  | "mobile_wallet"
  | "wallet"
  | "other";

/* =========================================================
   PAYOUT
========================================================= */

export interface IPayout
  extends Document {
  /* =======================================================
     IDENTIFIERS
  ======================================================== */

  payoutId: string;

  merchantId: mongoose.Types.ObjectId;

  /* =======================================================
     AMOUNT
  ======================================================== */

  amount: mongoose.Types.Decimal128;

  currency: string;

  feeAmount?: mongoose.Types.Decimal128;

  netAmount: mongoose.Types.Decimal128;

  /* =======================================================
     PAYOUT METHOD
  ======================================================== */

  payoutMethod: PayoutMethod;

  /*
   * Human-readable destination label.
   *
   * Example:
   * Brac Bank ****1234
   * bKash ****5678
   */
  destination?: string;

  /*
   * External destination/reference.
   *
   * Sensitive financial details should NOT be stored
   * in plaintext here in production.
   */
  destinationReference?: string;

  /* =======================================================
     STATUS
  ======================================================== */

  status: PayoutStatus;

  /* =======================================================
     REFERENCES
  ======================================================== */

  merchantReference?: string;

  externalReference?: string;

  idempotencyKey?: string;

  failureReason?: string;

  /* =======================================================
     LEDGER
  ======================================================== */

  ledgerEntryGroupId?: string;

  /* =======================================================
     TIMESTAMPS
  ======================================================== */

  requestedAt: Date;

  processingAt?: Date;

  completedAt?: Date;

  failedAt?: Date;

  cancelledAt?: Date;

  createdAt: Date;

  updatedAt: Date;
}

/* =========================================================
   SCHEMA
========================================================= */

const payoutSchema =
  new Schema<IPayout>(
    {
      /* =====================================================
         PAYOUT ID
      ====================================================== */

      payoutId: {
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
         AMOUNT
      ====================================================== */

      amount: {
        type: Schema.Types.Decimal128,
        required: true,
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

      feeAmount: {
        type: Schema.Types.Decimal128,
        default: undefined,
      },

      netAmount: {
        type: Schema.Types.Decimal128,
        required: true,
      },

      /* =====================================================
         METHOD
      ====================================================== */

      payoutMethod: {
        type: String,
        enum: [
          "bank",
          "mobile_wallet",
          "wallet",
          "other",
        ],
        required: true,
        index: true,
      },

      destination: {
        type: String,
        trim: true,
        maxlength: 200,
        default: undefined,
      },

      destinationReference: {
        type: String,
        trim: true,
        maxlength: 200,
        default: undefined,
      },

      /* =====================================================
         STATUS
      ====================================================== */

      status: {
        type: String,
        enum: [
          "pending",
          "processing",
          "completed",
          "failed",
          "cancelled",
        ],
        required: true,
        default: "pending",
        index: true,
      },

      /* =====================================================
         REFERENCES
      ====================================================== */

      merchantReference: {
        type: String,
        trim: true,
        maxlength: 150,
        default: undefined,
      },

      externalReference: {
        type: String,
        trim: true,
        maxlength: 200,
        default: undefined,
      },

      idempotencyKey: {
        type: String,
        trim: true,
        maxlength: 200,
        default: undefined,
      },

      failureReason: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: undefined,
      },

      /* =====================================================
         LEDGER
      ====================================================== */

      ledgerEntryGroupId: {
        type: String,
        trim: true,
        maxlength: 120,
        default: undefined,
        index: true,
      },

      /* =====================================================
         TIMESTAMPS
      ====================================================== */

      requestedAt: {
        type: Date,
        required: true,
        default: Date.now,
      },

      processingAt: {
        type: Date,
        default: undefined,
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

payoutSchema.index(
  {
    merchantId: 1,
    createdAt: -1,
  },
  {
    name: "payout_merchant_created_at",
  }
);

payoutSchema.index(
  {
    merchantId: 1,
    status: 1,
    createdAt: -1,
  },
  {
    name: "payout_merchant_status_created_at",
  }
);

payoutSchema.index(
  {
    merchantId: 1,
    currency: 1,
    status: 1,
    createdAt: -1,
  },
  {
    name: "payout_merchant_currency_status_created_at",
  }
);

payoutSchema.index(
  {
    merchantId: 1,
    idempotencyKey: 1,
  },
  {
    unique: true,
    sparse: true,
    name: "unique_payout_idempotency",
  }
);

/* =========================================================
   SAFE OBJECT OUTPUT
========================================================= */

payoutSchema.set(
  "toJSON",
  {
    virtuals: true,
  }
);

payoutSchema.set(
  "toObject",
  {
    virtuals: true,
  }
);

/* =========================================================
   MODEL
========================================================= */

const PayoutModel:
  Model<IPayout> =
  (mongoose.models.Payout as Model<IPayout>) ||
  mongoose.model<IPayout>(
    "Payout",
    payoutSchema
  );

/* =========================================================
   EXPORTS
========================================================= */

export const Payout =
  PayoutModel;

export default PayoutModel;