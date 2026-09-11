import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

/* =========================================================
   TYPES
========================================================= */

export type PaymentAttemptStatus =
  | "created"
  | "processing"
  | "authorized"
  | "captured"
  | "failed"
  | "cancelled";

export type PaymentAttemptOperation =
  | "create"
  | "authorize"
  | "capture"
  | "cancel";

export type PaymentAttemptFailureCode =
  | "provider_error"
  | "declined"
  | "timeout"
  | "network_error"
  | "validation_error"
  | "risk_blocked"
  | "unknown";

/* =========================================================
   PAYMENT ATTEMPT
========================================================= */

export interface IPaymentAttempt
  extends Document {
  /*
   * Unique platform attempt identifier.
   */
  attemptId: string;

  /*
   * Parent payment.
   */
  paymentId: mongoose.Types.ObjectId;

  /*
   * Merchant.
   */
  merchantId: mongoose.Types.ObjectId;

  /*
   * Provider used for this attempt.
   */
  provider: string;

  /*
   * Provider operation.
   */
  operation: PaymentAttemptOperation;

  /*
   * Attempt result.
   */
  status: PaymentAttemptStatus;

  /*
   * Provider-side reference.
   */
  providerRequestId?: string;

  providerResponseId?: string;

  /*
   * Provider error information.
   */
  failureCode?: PaymentAttemptFailureCode;

  failureMessage?: string;

  /*
   * Number of retries associated with this attempt.
   */
  attemptNumber: number;

  /*
   * Request/response metadata for diagnostics.
   *
   * Do NOT put secrets, card numbers, tokens or
   * authentication credentials in this object.
   */
  metadata?: Record<
    string,
    unknown
  >;

  startedAt?: Date;

  completedAt?: Date;

  createdAt: Date;

  updatedAt: Date;
}

/* =========================================================
   SCHEMA
========================================================= */

const paymentAttemptSchema =
  new Schema<IPaymentAttempt>(
    {
      /* =====================================================
         ATTEMPT ID
      ====================================================== */

      attemptId: {
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
        required: true,
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
         OPERATION
      ====================================================== */

      operation: {
        type: String,

        enum: [
          "create",
          "authorize",
          "capture",
          "cancel",
        ],

        required: true,
      },

      /* =====================================================
         STATUS
      ====================================================== */

      status: {
        type: String,

        enum: [
          "created",
          "processing",
          "authorized",
          "captured",
          "failed",
          "cancelled",
        ],

        required: true,
        default: "created",
        index: true,
      },

      /* =====================================================
         PROVIDER REQUEST ID
      ====================================================== */

      providerRequestId: {
        type: String,
        trim: true,
        maxlength: 200,
        default: undefined,
      },

      providerResponseId: {
        type: String,
        trim: true,
        maxlength: 200,
        default: undefined,
        index: true,
      },

      /* =====================================================
         FAILURE
      ====================================================== */

      failureCode: {
        type: String,

        enum: [
          "provider_error",
          "declined",
          "timeout",
          "network_error",
          "validation_error",
          "risk_blocked",
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

      /* =====================================================
         ATTEMPT NUMBER
      ====================================================== */

      attemptNumber: {
        type: Number,
        required: true,
        default: 1,
        min: 1,
        max: 100,
      },

      /* =====================================================
         METADATA
      ====================================================== */

      metadata: {
        type: Schema.Types.Mixed,
        default: undefined,
      },

      /* =====================================================
         TIMESTAMPS
      ====================================================== */

      startedAt: {
        type: Date,
        default: undefined,
      },

      completedAt: {
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

paymentAttemptSchema.index(
  {
    paymentId: 1,
    createdAt: -1,
  },
  {
    name: "payment_attempt_payment_history",
  }
);

paymentAttemptSchema.index(
  {
    merchantId: 1,
    provider: 1,
    status: 1,
    createdAt: -1,
  },
  {
    name: "payment_attempt_merchant_provider_status",
  }
);

paymentAttemptSchema.index(
  {
    provider: 1,
    providerResponseId: 1,
  },
  {
    sparse: true,
    name: "payment_attempt_provider_response",
  }
);

/* =========================================================
   MODEL
========================================================= */

const PaymentAttemptModel:
  Model<IPaymentAttempt> =
  (mongoose.models.PaymentAttempt as Model<IPaymentAttempt>) ||
  mongoose.model<IPaymentAttempt>(
    "PaymentAttempt",
    paymentAttemptSchema
  );

/* =========================================================
   EXPORTS
========================================================= */

export const PaymentAttempt =
  PaymentAttemptModel;

export default PaymentAttemptModel;