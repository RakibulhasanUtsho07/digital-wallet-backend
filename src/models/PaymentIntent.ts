import mongoose, {
  Document,
  Schema,
} from "mongoose";

export type PaymentIntentStatus =
  | "CREATED"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED";

export interface IPaymentIntent
  extends Document {
  userId: mongoose.Types.ObjectId;

  walletId: mongoose.Types.ObjectId;

  provider: string;

  sourceAccount: string;

  amount: number;

  currency: "BDT";

  reference?: string;

  idempotencyKey: string;

  status: PaymentIntentStatus;

  providerTransactionId?: string;

  failureCode?: string;

  failureMessage?: string;

  createdAt: Date;

  updatedAt: Date;
}

const paymentIntentSchema =
  new Schema<IPaymentIntent>(
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

      provider: {
        type: String,
        required: true,
      },

      sourceAccount: {
        type: String,
        required: true,
      },

      amount: {
        type: Number,
        required: true,
        min: 0.01,
      },

      currency: {
        type: String,
        enum: ["BDT"],
        default: "BDT",
      },

      reference: {
        type: String,
        maxlength: 160,
      },

      idempotencyKey: {
        type: String,
        required: true,
      },

      status: {
        type: String,
        enum: [
          "CREATED",
          "PROCESSING",
          "SUCCESS",
          "FAILED",
          "CANCELLED",
        ],
        default: "CREATED",
        index: true,
      },

      providerTransactionId: {
        type: String,
      },

      failureCode: {
        type: String,
      },

      failureMessage: {
        type: String,
      },
    },
    {
      timestamps: true,
      versionKey: false,
    }
  );

paymentIntentSchema.index(
  {
    userId: 1,
    idempotencyKey: 1,
  },
  {
    unique: true,
  }
);

export const PaymentIntent =
  mongoose.models.PaymentIntent ||
  mongoose.model<IPaymentIntent>(
    "PaymentIntent",
    paymentIntentSchema
  );

export default PaymentIntent;