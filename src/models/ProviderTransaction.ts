import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

/* =========================================================
   TYPES
========================================================= */

export type ProviderTransactionStatus =
  | "pending"
  | "authorized"
  | "captured"
  | "completed"
  | "failed"
  | "cancelled"
  | "refunded"
  | "disputed";

export type ProviderTransactionType =
  | "payment"
  | "authorization"
  | "capture"
  | "refund"
  | "payout"
  | "dispute";

/* =========================================================
   PROVIDER TRANSACTION
========================================================= */

export interface IProviderTransaction
  extends Document {
  /*
   * Platform identifier.
   */
  providerTransactionId: string;

  /*
   * Payment within our platform.
   */
  paymentId?: mongoose.Types.ObjectId;

  /*
   * Merchant owning the operation.
   */
  merchantId: mongoose.Types.ObjectId;

  /*
   * Provider name.
   *
   * Example:
   * paypal
   * stripe
   * bkash
   */
  provider: string;

  /*
   * Provider environment.
   */
  mode: "test" | "live";

  /*
   * Provider's own transaction/order ID.
   */
  externalTransactionId: string;

  /*
   * Provider transaction type.
   */
  transactionType: ProviderTransactionType;

  /*
   * Current provider-side state mapped into
   * our normalized state.
   */
  status: ProviderTransactionStatus;

  /*
   * Provider amount.
   */
  amount: mongoose.Types.Decimal128;

  currency: string;

  /*
   * Optional raw provider event name.
   *
   * Example:
   * PAYMENT.CAPTURE.COMPLETED
   */
  providerEventType?: string;

  /*
   * Optional merchant/provider correlation ID.
   */
  correlationId?: string;

  /*
   * Provider event timestamp.
   */
  providerCreatedAt?: Date;

  /*
   * Safe metadata only.
   */
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

const providerTransactionSchema =
  new Schema<IProviderTransaction>(
    {
      /* =====================================================
         PLATFORM PROVIDER TRANSACTION ID
      ====================================================== */

      providerTransactionId: {
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
         PAYMENT
      ====================================================== */

      paymentId: {
        type: Schema.Types.ObjectId,
        ref: "Payment",
        default: undefined,
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
         PROVIDER
      ====================================================== */

      provider: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        maxlength: 50,
        index: true,
      },

      /* =====================================================
         MODE
      ====================================================== */

      mode: {
        type: String,

        enum: [
          "test",
          "live",
        ],

        required: true,
        index: true,
      },

      /* =====================================================
         EXTERNAL TRANSACTION
      ====================================================== */

      externalTransactionId: {
        type: String,
        required: true,
        trim: true,
        maxlength: 250,
      },

      /* =====================================================
         TRANSACTION TYPE
      ====================================================== */

      transactionType: {
        type: String,

        enum: [
          "payment",
          "authorization",
          "capture",
          "refund",
          "payout",
          "dispute",
        ],

        required: true,
        index: true,
      },

      /* =====================================================
         STATUS
      ====================================================== */

      status: {
        type: String,

        enum: [
          "pending",
          "authorized",
          "captured",
          "completed",
          "failed",
          "cancelled",
          "refunded",
          "disputed",
        ],

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
      },

      /* =====================================================
         PROVIDER EVENT
      ====================================================== */

      providerEventType: {
        type: String,
        trim: true,
        maxlength: 150,
        default: undefined,
      },

      /* =====================================================
         CORRELATION
      ====================================================== */

      correlationId: {
        type: String,
        trim: true,
        maxlength: 200,
        default: undefined,
        index: true,
      },

      /* =====================================================
         PROVIDER CREATED AT
      ====================================================== */

      providerCreatedAt: {
        type: Date,
        default: undefined,
      },

      /* =====================================================
         METADATA
      ====================================================== */

      metadata: {
        type: Schema.Types.Mixed,
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
 * A provider transaction must not be duplicated for the
 * same provider/environment/external ID/type.
 */
providerTransactionSchema.index(
  {
    provider: 1,
    mode: 1,
    externalTransactionId: 1,
    transactionType: 1,
  },
  {
    unique: true,
    name: "unique_provider_external_transaction",
  }
);

providerTransactionSchema.index(
  {
    merchantId: 1,
    createdAt: -1,
  },
  {
    name: "provider_transaction_merchant_created_at",
  }
);

providerTransactionSchema.index(
  {
    paymentId: 1,
    createdAt: -1,
  },
  {
    name: "provider_transaction_payment_history",
  }
);

providerTransactionSchema.index(
  {
    provider: 1,
    status: 1,
    createdAt: -1,
  },
  {
    name: "provider_transaction_provider_status",
  }
);

/* =========================================================
   MODEL
========================================================= */

const ProviderTransactionModel:
  Model<IProviderTransaction> =
  (mongoose.models.ProviderTransaction as Model<IProviderTransaction>) ||
  mongoose.model<IProviderTransaction>(
    "ProviderTransaction",
    providerTransactionSchema
  );

/* =========================================================
   EXPORTS
========================================================= */

export const ProviderTransaction =
  ProviderTransactionModel;

export default ProviderTransactionModel;