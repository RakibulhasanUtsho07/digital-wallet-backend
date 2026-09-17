import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

/* =========================================================
   PAYMENT PROVIDERS
========================================================= */

export type PaymentProvider =
  | "bkash"
  | "nagad"
  | "rocket"
  | "upay"
  | "dbbl"
  | "brac"
  | "city"
  | "ebl"
  | "bankasia"
  | "prime"
  | "sonali";

/* =========================================================
   PAYMENT SOURCE STATUS
========================================================= */

export type PaymentSourceStatus =
  | "ACTIVE"
  | "BLOCKED"
  | "CLOSED";

/* =========================================================
   PAYMENT SOURCE
========================================================= */

export interface IPaymentSource
  extends Document {
  provider: PaymentProvider;

  /*
   * Demo source account number.
   *
   * IMPORTANT:
   * This value should normally remain internal and should
   * never be returned directly from sensitive API responses
   * unless explicitly required.
   */
  accountNumber: string;

  /*
   * HMAC-based normalized account lookup.
   *
   * Example concept:
   *
   * HMAC(accountNumber) -> accountLookup
   *
   * This allows backend lookup without using plaintext
   * account numbers as the database lookup key.
   */
  accountLookup: string;

  /*
   * Demo account owner name.
   */
  accountName: string;

  /*
   * HMAC/hash of the demo secret code.
   *
   * NEVER store the plaintext secret code.
   *
   * Production/live gateway mode should eventually
   * replace this with provider-side authentication.
   */
  secretCodeHash: string;

  /*
   * Available source balance.
   *
   * Demo mode:
   * this is the simulated provider account balance.
   */
  balance: number;

  /*
   * Source account operational state.
   */
  status: PaymentSourceStatus;

  /*
   * Currently the application supports BDT only.
   */
  currency: "BDT";

  createdAt: Date;

  updatedAt: Date;
}

/* =========================================================
   SCHEMA
========================================================= */

const paymentSourceSchema =
  new Schema<IPaymentSource>(
    {
      /* =====================================================
         PROVIDER
      ====================================================== */

      provider: {
        type: String,

        enum: [
          "bkash",
          "nagad",
          "rocket",
          "upay",
          "dbbl",
          "brac",
          "city",
          "ebl",
          "bankasia",
          "prime",
          "sonali",
        ],

        required: true,

        index: true,

        trim: true,
      },

      /* =====================================================
         ACCOUNT NUMBER
      ====================================================== */

      accountNumber: {
        type: String,

        required: true,

        trim: true,

        minlength: 8,

        maxlength: 32,

        /*
         * We intentionally do NOT make this field unique.
         *
         * The unique identity is:
         *
         * provider + accountLookup
         */
      },

      /* =====================================================
         ACCOUNT LOOKUP
      ====================================================== */

      accountLookup: {
        type: String,

        required: true,

        trim: true,

        index: true,

        maxlength: 128,
      },

      /* =====================================================
         ACCOUNT NAME
      ====================================================== */

      accountName: {
        type: String,

        required: true,

        trim: true,

        minlength: 2,

        maxlength: 120,
      },

      /* =====================================================
         SECRET CODE HASH
      ====================================================== */

      secretCodeHash: {
        type: String,

        required: true,

        select: false,

        trim: true,

        maxlength: 128,
      },

      /* =====================================================
         SOURCE BALANCE
      ====================================================== */

      balance: {
        type: Number,

        required: true,

        default: 0,

        min: 0,

        /*
         * Prevent NaN from accidentally entering the DB.
         */
        validate: {
          validator: (
            value: number
          ) => Number.isFinite(value),

          message:
            "Source balance must be a valid number.",
        },
      },

      /* =====================================================
         STATUS
      ====================================================== */

      status: {
        type: String,

        enum: [
          "ACTIVE",
          "BLOCKED",
          "CLOSED",
        ],

        required: true,

        default: "ACTIVE",

        index: true,
      },

      /* =====================================================
         CURRENCY
      ====================================================== */

      currency: {
        type: String,

        enum: [
          "BDT",
        ],

        required: true,

        default: "BDT",
      },
    },

    {
      timestamps: true,

      versionKey: false,

      strict: true,

      /* =====================================================
         SAFE JSON
      ====================================================== */

      toJSON: {
        virtuals: true,

        transform: (
          _doc,
          returnedObject
        ) => {
          /*
           * Convert to a generic record first so TypeScript
           * does not complain when removing internal fields.
           */

          const safeObject =
            returnedObject as unknown as Record<
              string,
              unknown
            >;

          /*
           * NEVER expose:
           *
           * - secretCodeHash
           * - accountLookup
           */

          delete safeObject[
            "secretCodeHash"
          ];

          delete safeObject[
            "accountLookup"
          ];

          return safeObject;
        },
      },

      /* =====================================================
         SAFE OBJECT
      ====================================================== */

      toObject: {
        virtuals: true,

        transform: (
          _doc,
          returnedObject
        ) => {
          const safeObject =
            returnedObject as unknown as Record<
              string,
              unknown
            >;

          delete safeObject[
            "secretCodeHash"
          ];

          delete safeObject[
            "accountLookup"
          ];

          return safeObject;
        },
      },
    }
  );

/* =========================================================
   INDEXES
========================================================= */

/*
 * Main unique source identity.
 *
 * Same account number may exist under different providers,
 * therefore provider is part of the unique key.
 *
 * Example:
 *
 * bkash + HMAC(01710000001)
 *
 * is different from:
 *
 * nagad + HMAC(01710000001)
 */
paymentSourceSchema.index(
  {
    provider: 1,

    accountLookup: 1,
  },
  {
    unique: true,

    name:
      "unique_payment_source_provider_account",
  }
);

/*
 * Optimized active-account lookup.
 *
 * Used by source verification / funding flow.
 */
paymentSourceSchema.index(
  {
    provider: 1,

    status: 1,

    accountLookup: 1,
  },
  {
    name:
      "payment_source_active_lookup",
  }
);

/*
 * Useful for admin/provider-level queries.
 */
paymentSourceSchema.index(
  {
    provider: 1,

    createdAt: -1,
  },
  {
    name:
      "payment_source_provider_created_at",
  }
);

/* =========================================================
   MODEL
========================================================= */

const PaymentSourceModel =
  (
    mongoose.models
      .PaymentSource as
      | Model<IPaymentSource>
      | undefined
  ) ||
  mongoose.model<IPaymentSource>(
    "PaymentSource",
    paymentSourceSchema
  );

/* =========================================================
   EXPORT
========================================================= */

export const PaymentSource =
  PaymentSourceModel;

export default PaymentSourceModel;