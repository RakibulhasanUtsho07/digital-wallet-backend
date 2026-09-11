import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

/* =========================================================
   TYPES
========================================================= */

export type MerchantApiKeyEnvironment =
  | "test"
  | "live";

/*
 * API permissions/scopes.
 *
 * These are the capabilities that a merchant API key
 * can access.
 */
export type MerchantApiScope =
  | "payments:read"
  | "payments:write"
  | "refunds:write"
  | "orders:read"
  | "orders:write"
  | "customers:read"
  | "subscriptions:write"
  | "payouts:write"
  | "invoices:write"
  | "webhooks:manage";

export type MerchantApiKeyStatus =
  | "active"
  | "revoked"
  | "expired";

/* =========================================================
   MERCHANT API KEY
========================================================= */

export interface IMerchantApiKey
  extends Document {
  /*
   * Merchant that owns this API key.
   */
  merchantId: mongoose.Types.ObjectId;

  /*
   * Internal unique identifier of the key.
   *
   * Example:
   * key_01H...
   */
  keyId: string;

  /*
   * Visible prefix used for identification.
   *
   * Examples:
   * pk_test_
   * sk_test_
   * pk_live_
   * sk_live_
   *
   * We store only the prefix/identifier here,
   * never the reusable secret.
   */
  keyPrefix: string;

  /*
   * Hash of the secret.
   *
   * NEVER store the plaintext secret in MongoDB.
   */
  secretHash: string;

  /*
   * Test or live environment.
   */
  environment: MerchantApiKeyEnvironment;

  /*
   * API scopes allowed for this key.
   */
  scopes: MerchantApiScope[];

  /*
   * Key lifecycle.
   */
  status: MerchantApiKeyStatus;

  /*
   * Last observed API usage.
   */
  lastUsedAt?: Date;

  /*
   * Optional expiry.
   */
  expiresAt?: Date;

  /*
   * Revocation timestamp.
   */
  revokedAt?: Date;

  /*
   * Optional human-readable label.
   *
   * Example:
   * Production Website
   * Mobile App
   * Testing
   */
  name?: string;

  createdAt: Date;
  updatedAt: Date;
}

/* =========================================================
   ENUM VALUES
========================================================= */

export const MERCHANT_API_SCOPES: readonly MerchantApiScope[] = [
  "payments:read",
  "payments:write",
  "refunds:write",
  "orders:read",
  "orders:write",
  "customers:read",
  "subscriptions:write",
  "payouts:write",
  "invoices:write",
  "webhooks:manage",
] as const;

/* =========================================================
   SCHEMA
========================================================= */

const merchantApiKeySchema =
  new Schema<IMerchantApiKey>(
    {
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
         KEY ID
      ====================================================== */

      keyId: {
        type: String,
        required: true,
        trim: true,
        immutable: true,
        index: true,
        minlength: 4,
        maxlength: 100,
      },

      /* =====================================================
         KEY PREFIX
      ====================================================== */

      keyPrefix: {
        type: String,
        required: true,
        trim: true,
        immutable: true,
        maxlength: 32,
        index: true,
      },

      /* =====================================================
         SECRET HASH
      ====================================================== */

      secretHash: {
        type: String,
        required: true,
        select: false,
      },

      /* =====================================================
         ENVIRONMENT
      ====================================================== */

      environment: {
        type: String,

        enum: [
          "test",
          "live",
        ],

        required: true,
        index: true,
      },

      /* =====================================================
         SCOPES
      ====================================================== */

      scopes: {
        type: [
          {
            type: String,

            enum: MERCHANT_API_SCOPES,
          },
        ],

        required: true,

        default: [],

        validate: {
          validator: (
            value: unknown
          ): boolean => {
            return (
              Array.isArray(value) &&
              value.length > 0
            );
          },

          message:
            "At least one API scope is required.",
        },
      },

      /* =====================================================
         STATUS
      ====================================================== */

      status: {
        type: String,

        enum: [
          "active",
          "revoked",
          "expired",
        ],

        default: "active",
        required: true,
        index: true,
      },

      /* =====================================================
         LAST USED
      ====================================================== */

      lastUsedAt: {
        type: Date,
        default: undefined,
      },

      /* =====================================================
         EXPIRATION
      ====================================================== */

      expiresAt: {
        type: Date,
        default: undefined,
        index: true,
      },

      /* =====================================================
         REVOCATION
      ====================================================== */

      revokedAt: {
        type: Date,
        default: undefined,
      },

      /* =====================================================
         NAME / LABEL
      ====================================================== */

      name: {
        type: String,
        trim: true,
        maxlength: 100,
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
 * keyId must be globally unique.
 */
merchantApiKeySchema.index(
  {
    keyId: 1,
  },
  {
    unique: true,
    name: "unique_merchant_api_key_id",
  }
);

/*
 * Fast lookup during API authentication.
 *
 * merchantId + environment + keyPrefix allows us
 * to narrow the search before secret verification.
 */
merchantApiKeySchema.index(
  {
    merchantId: 1,
    environment: 1,
    keyPrefix: 1,
  },
  {
    name: "merchant_api_key_lookup",
  }
);

/*
 * Active key lookup.
 */
merchantApiKeySchema.index(
  {
    merchantId: 1,
    environment: 1,
    status: 1,
  },
  {
    name: "merchant_api_key_status_lookup",
  }
);

/*
 * Expiration/revocation operations.
 */
merchantApiKeySchema.index(
  {
    expiresAt: 1,
    status: 1,
  },
  {
    name: "merchant_api_key_expiry_status",
  }
);

/* =========================================================
   MODEL
========================================================= */

const MerchantApiKeyModel: Model<IMerchantApiKey> =
  (mongoose.models.MerchantApiKey as Model<IMerchantApiKey>) ||
  mongoose.model<IMerchantApiKey>(
    "MerchantApiKey",
    merchantApiKeySchema
  );

/* =========================================================
   EXPORTS
========================================================= */

export const MerchantApiKey =
  MerchantApiKeyModel;

export default MerchantApiKeyModel;