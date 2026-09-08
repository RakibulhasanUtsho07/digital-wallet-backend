import mongoose, {
  Document,
  Schema,
} from "mongoose";

/* =========================================================
   TYPES
========================================================= */

export type AddMoneySourceType =
  | "BANK"
  | "MFS";

export type AddMoneyProvider =
  | "DEMO"
  | "BKASH"
  | "NAGAD"
  | "ROCKET"
  | "BANK_API";

export type AddMoneyStatus =
  | "INITIATED"
  | "PENDING"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED";

export interface IAddMoneyTransaction
  extends Document {
  userId: mongoose.Types.ObjectId;

  walletId: mongoose.Types.ObjectId;

  amount: number;

  currency: string;

  sourceType: AddMoneySourceType;

  provider: AddMoneyProvider;

  providerName: string;

  status: AddMoneyStatus;

  idempotencyKey: string;

  providerTransactionId?: string;

  customerReference?: string;

  maskedAccount?: string;

  demoVerificationCode?: string;

  failureReason?: string;

  initiatedAt: Date;

  completedAt?: Date;

  creditedAt?: Date;

  balanceBefore?: number;

  balanceAfter?: number;

  metadata?: Record<
    string,
    unknown
  >;

  createdAt: Date;

  updatedAt: Date;
}

/* =========================================================
   SCHEMA
========================================================= */

const addMoneyTransactionSchema =
  new Schema<IAddMoneyTransaction>(
    {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      walletId: {
        type: Schema.Types.ObjectId,
        ref: "Wallet",
        required: true,
        index: true,
      },

      amount: {
        type: Number,
        required: true,
        min: 1,
      },

      currency: {
        type: String,
        required: true,
        default: "BDT",
        enum: [
          "BDT",
          "USD",
          "EUR",
        ],
      },

      sourceType: {
        type: String,
        enum: [
          "BANK",
          "MFS",
        ],
        required: true,
        index: true,
      },

      provider: {
        type: String,
        enum: [
          "DEMO",
          "BKASH",
          "NAGAD",
          "ROCKET",
          "BANK_API",
        ],
        required: true,
        index: true,
      },

      providerName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
      },

      status: {
        type: String,
        enum: [
          "INITIATED",
          "PENDING",
          "SUCCESS",
          "FAILED",
          "CANCELLED",
        ],
        default: "INITIATED",
        required: true,
        index: true,
      },

      /*
       * Frontend retry safe.
       */
      idempotencyKey: {
        type: String,
        required: true,
        trim: true,
        maxlength: 160,
      },

      providerTransactionId: {
        type: String,
        trim: true,
        maxlength: 200,
      },

      customerReference: {
        type: String,
        trim: true,
        maxlength: 120,
      },

      maskedAccount: {
        type: String,
        trim: true,
        maxlength: 120,
      },

      /*
       * DEMO ONLY.
       *
       * Do not populate this in production.
       */
      demoVerificationCode: {
        type: String,
        select: false,
      },

      failureReason: {
        type: String,
        trim: true,
        maxlength: 500,
      },

      initiatedAt: {
        type: Date,
        default: Date.now,
        required: true,
      },

      completedAt: {
        type: Date,
      },

      creditedAt: {
        type: Date,
      },

      balanceBefore: {
        type: Number,
      },

      balanceAfter: {
        type: Number,
      },

      metadata: {
        type: Schema.Types.Mixed,
      },
    },
    {
      timestamps: true,
      versionKey: false,
    }
  );

/* =========================================================
   INDEXES
========================================================= */

addMoneyTransactionSchema.index(
  {
    userId: 1,
    createdAt: -1,
  }
);

addMoneyTransactionSchema.index(
  {
    walletId: 1,
    createdAt: -1,
  }
);

addMoneyTransactionSchema.index(
  {
    providerTransactionId: 1,
  },
  {
    sparse: true,
  }
);

addMoneyTransactionSchema.index(
  {
    userId: 1,
    idempotencyKey: 1,
  },
  {
    unique: true,
  }
);

addMoneyTransactionSchema.index(
  {
    userId: 1,
    status: 1,
    createdAt: -1,
  }
);

/* =========================================================
   MODEL
========================================================= */

export const AddMoneyTransaction =
  mongoose.models.AddMoneyTransaction ||
  mongoose.model<IAddMoneyTransaction>(
    "AddMoneyTransaction",
    addMoneyTransactionSchema
  );

export default AddMoneyTransaction;