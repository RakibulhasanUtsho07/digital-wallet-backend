import mongoose, {
  Schema,
  type Document,
} from "mongoose";

/* =========================================================
   TYPES
========================================================= */

export type DisputeStatus =
  | "disputed"
  | "under_review"
  | "won"
  | "lost";

export type DisputeReason =
  | "fraud"
  | "duplicate"
  | "product_not_received"
  | "product_not_as_described"
  | "unauthorized"
  | "processing_error"
  | "other";

/* =========================================================
   INTERFACE
========================================================= */

export interface IDispute
  extends Document {
  disputeId: string;

  merchantId: mongoose.Types.ObjectId;

  paymentId: mongoose.Types.ObjectId;

  customerId?: mongoose.Types.ObjectId;

  amount: mongoose.Types.Decimal128;

  currency: string;

  reason: DisputeReason;

  description?: string;

  status: DisputeStatus;

  evidence?: Array<{
    title: string;
    description?: string;
    url?: string;
    submittedAt: Date;
  }>;

  merchantResponse?: string;

  resolutionNote?: string;

  resolvedAt?: Date;

  createdAt: Date;

  updatedAt: Date;
}

/* =========================================================
   SCHEMA
========================================================= */

const disputeSchema =
  new Schema<IDispute>(
    {
      disputeId: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true,
      },

      merchantId: {
        type: Schema.Types.ObjectId,
        ref: "Merchant",
        required: true,
        index: true,
      },

      paymentId: {
        type: Schema.Types.ObjectId,
        ref: "Payment",
        required: true,
        index: true,
      },

      customerId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        index: true,
      },

      amount: {
        type: Schema.Types.Decimal128,
        required: true,
      },

      currency: {
        type: String,
        required: true,
        uppercase: true,
        trim: true,
        minlength: 3,
        maxlength: 3,
      },

      reason: {
        type: String,
        enum: [
          "fraud",
          "duplicate",
          "product_not_received",
          "product_not_as_described",
          "unauthorized",
          "processing_error",
          "other",
        ],
        required: true,
      },

      description: {
        type: String,
        trim: true,
        maxlength: 5000,
      },

      status: {
        type: String,
        enum: [
          "disputed",
          "under_review",
          "won",
          "lost",
        ],
        default: "disputed",
        required: true,
        index: true,
      },

      evidence: [
        {
          title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200,
          },

          description: {
            type: String,
            trim: true,
            maxlength: 2000,
          },

          url: {
            type: String,
            trim: true,
            maxlength: 2000,
          },

          submittedAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],

      merchantResponse: {
        type: String,
        trim: true,
        maxlength: 5000,
      },

      resolutionNote: {
        type: String,
        trim: true,
        maxlength: 5000,
      },

      resolvedAt: {
        type: Date,
      },
    },
    {
      timestamps: true,
    },
  );

/* =========================================================
   INDEXES
========================================================= */

disputeSchema.index({
  merchantId: 1,
  createdAt: -1,
});

disputeSchema.index({
  merchantId: 1,
  status: 1,
  createdAt: -1,
});

disputeSchema.index({
  merchantId: 1,
  paymentId: 1,
});

disputeSchema.index({
  merchantId: 1,
  customerId: 1,
});

/* =========================================================
   MODEL
========================================================= */

export const Dispute =
  mongoose.model<IDispute>(
    "Dispute",
    disputeSchema,
  );