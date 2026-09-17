import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

/* =========================================================
   TYPES
========================================================= */

export type PaymentStatus =
  | "pending"
  | "authorized"
  | "captured"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

export type PaymentMode =
  | "test"
  | "live";

export type PaymentSourceType =
  | "paypal"
  | "card"
  | "local_psp"
  | "wallet";

export type PaymentCustomerType =
  | "user"
  | "guest";

export type PaymentFailureCode =
  | "provider_error"
  | "insufficient_funds"
  | "declined"
  | "cancelled"
  | "expired"
  | "validation_error"
  | "risk_blocked"
  | "unknown";

export type PaymentAmount = mongoose.Types.Decimal128;

/* =========================================================
   PAYMENT
========================================================= */

export interface IPayment
  extends Document {
  /* =======================================================
     IDENTIFIERS
  ======================================================== */

  paymentId: string;

  merchantId: mongoose.Types.ObjectId;

  customerId?: mongoose.Types.ObjectId;

  /*
   * Optional order association.
   */
  orderId?: mongoose.Types.ObjectId;

  /* =======================================================
     AMOUNT
  ======================================================== */

  amount: PaymentAmount;

  currency: string;

  /*
   * Optional fee calculated by the platform.
   */
  feeAmount?: PaymentAmount;

  /*
   * Amount ultimately credited to merchant after
   * applicable fees.
   */
  netAmount?: PaymentAmount;

  /* =======================================================
     PAYMENT SOURCE
  ======================================================== */

  sourceType: PaymentSourceType;

  /*
   * External provider chosen for this payment.
   *
   * Example:
   * paypal
   * card
   * bkash
   */
  provider: string;

  /* =======================================================
     ENVIRONMENT
  ======================================================== */

  mode: PaymentMode;

  /* =======================================================
     LIFECYCLE
  ======================================================== */

  status: PaymentStatus;

  /*
   * Provider-side payment reference.
   */
  providerPaymentId?: string;

  /*
   * Merchant's own reference.
   */
  merchantReference?: string;

  /*
   * Idempotency key supplied during creation.
   */
  idempotencyKey?: string;

  /* =======================================================
     FAILURE
  ======================================================== */

  failureCode?: PaymentFailureCode;

  failureMessage?: string;

  /* =======================================================
     CHECKOUT
  ======================================================== */

  returnUrl?: string;

  cancelUrl?: string;

  checkoutUrl?: string;

  /* =======================================================
     TIMESTAMPS
  ======================================================== */

  authorizedAt?: Date;

  capturedAt?: Date;

  completedAt?: Date;

  failedAt?: Date;

  cancelledAt?: Date;

  expiredAt?: Date;

  createdAt: Date;

  updatedAt: Date;
}

/* =========================================================
   SCHEMA
========================================================= */

const paymentSchema =
  new Schema<IPayment>(
    {
      /* =====================================================
         PAYMENT ID
      ====================================================== */

      paymentId: {
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
         CUSTOMER
      ====================================================== */

      customerId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: undefined,
        index: true,
      },

      /* =====================================================
         ORDER
      ====================================================== */

      orderId: {
        type: Schema.Types.ObjectId,
        ref: "Order",
        default: undefined,
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

      feeAmount: {
        type: Schema.Types.Decimal128,
        default: undefined,
      },

      netAmount: {
        type: Schema.Types.Decimal128,
        default: undefined,
      },

      /* =====================================================
         SOURCE
      ====================================================== */

      sourceType: {
        type: String,

        enum: [
          "paypal",
          "card",
          "local_psp",
          "wallet",
        ],

        required: true,
        index: true,
      },

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
          "expired",
        ],

        required: true,
        default: "pending",
        index: true,
      },

      /* =====================================================
         PROVIDER REFERENCE
      ====================================================== */

      providerPaymentId: {
        type: String,
        trim: true,
        default: undefined,
        index: true,
      },

      /* =====================================================
         MERCHANT REFERENCE
      ====================================================== */

      merchantReference: {
        type: String,
        trim: true,
        maxlength: 150,
        default: undefined,
      },

      /* =====================================================
         IDEMPOTENCY
      ====================================================== */

      idempotencyKey: {
        type: String,
        trim: true,
        maxlength: 200,
        default: undefined,
      },

      /* =====================================================
         FAILURE
      ====================================================== */

      failureCode: {
        type: String,

        enum: [
          "provider_error",
          "insufficient_funds",
          "declined",
          "cancelled",
          "expired",
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
         CHECKOUT
      ====================================================== */

      returnUrl: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: undefined,
      },

      cancelUrl: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: undefined,
      },

      checkoutUrl: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: undefined,
      },

      /* =====================================================
         TIMESTAMPS
      ====================================================== */

      authorizedAt: {
        type: Date,
        default: undefined,
      },

      capturedAt: {
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

      expiredAt: {
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

paymentSchema.index(
  {
    merchantId: 1,
    createdAt: -1,
  },
  {
    name: "payment_merchant_created_at",
  }
);

paymentSchema.index(
  {
    merchantId: 1,
    status: 1,
    createdAt: -1,
  },
  {
    name: "payment_merchant_status_created_at",
  }
);

paymentSchema.index(
  {
    merchantId: 1,
    mode: 1,
    provider: 1,
    createdAt: -1,
  },
  {
    name: "payment_merchant_mode_provider_created_at",
  }
);

paymentSchema.index(
  {
    provider: 1,
    providerPaymentId: 1,
  },
  {
    sparse: true,
    name: "payment_provider_reference",
  }
);

/*
 * Important for merchant API idempotency.
 *
 * A merchant should not accidentally create multiple
 * payments for the same idempotency key in the same mode.
 */
paymentSchema.index(
  {
    merchantId: 1,
    mode: 1,
    idempotencyKey: 1,
  },
  {
    unique: true,
    sparse: true,
    name: "unique_payment_idempotency_key",
  }
);

paymentSchema.set(
  "toJSON",
  {
    virtuals: true,
  }
);

paymentSchema.set(
  "toObject",
  {
    virtuals: true,
  }
);

/* =========================================================
   MODEL
========================================================= */

const PaymentModel:
  Model<IPayment> =
  (mongoose.models.Payment as Model<IPayment>) ||
  mongoose.model<IPayment>(
    "Payment",
    paymentSchema
  );

/* =========================================================
   EXPORTS
========================================================= */

export const Payment =
  PaymentModel;

export default PaymentModel;