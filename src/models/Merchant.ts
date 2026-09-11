import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

/* =========================================================
   TYPES
========================================================= */

export type MerchantStatus =
  | "pending"
  | "active"
  | "suspended"
  | "disabled";

export type MerchantVerificationStatus =
  | "not_started"
  | "pending"
  | "verified"
  | "rejected";

export type MerchantBusinessType =
  | "individual"
  | "sole_proprietorship"
  | "partnership"
  | "company"
  | "organization";

export type MerchantEnvironment =
  | "test"
  | "live";

/* =========================================================
   MERCHANT
========================================================= */

export interface IMerchant
  extends Document {
  /*
   * User who owns the merchant account.
   *
   * A merchant is linked to an existing User account
   * instead of creating a second authentication identity.
   */
  ownerId: mongoose.Types.ObjectId;

  /* Business information */
  businessName: string;
  businessDisplayName?: string;
  businessType: MerchantBusinessType;

  /*
   * Unique URL/API-friendly identifier.
   *
   * Example:
   * your-business
   */
  slug: string;

  /* Contact */
  businessEmail: string;
  businessPhone?: string;

  /* Website / business information */
  websiteUrl?: string;
  description?: string;

  /* Location */
  country: string;
  countryCode: string;

  /* Currency */
  defaultCurrency: string;

  /* Account status */
  status: MerchantStatus;

  /* Merchant verification / onboarding */
  verificationStatus: MerchantVerificationStatus;

  /*
   * Optional verification timestamps.
   */
  verifiedAt?: Date;
  rejectedAt?: Date;

  /*
   * Soft suspension / disable information.
   */
  suspendedAt?: Date;
  suspendedReason?: string;

  /*
   * Live payments should only become available after
   * the merchant is appropriately activated.
   */
  liveEnabled: boolean;

  /*
   * Test mode is available by default.
   */
  testEnabled: boolean;

  /*
   * Merchant onboarding timestamps.
   */
  activatedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

/* =========================================================
   MERCHANT SCHEMA
========================================================= */

const merchantSchema =
  new Schema<IMerchant>(
    {
      /* =====================================================
         OWNER
      ====================================================== */

      ownerId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      /* =====================================================
         BUSINESS
      ====================================================== */

      businessName: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 150,
      },

      businessDisplayName: {
        type: String,
        trim: true,
        maxlength: 150,
        default: undefined,
      },

      businessType: {
        type: String,

        enum: [
          "individual",
          "sole_proprietorship",
          "partnership",
          "company",
          "organization",
        ],

        required: true,
        default: "individual",
        index: true,
      },

      /* =====================================================
         SLUG
      ====================================================== */

      slug: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        minlength: 2,
        maxlength: 100,
        index: true,
      },

      /* =====================================================
         CONTACT
      ====================================================== */

      businessEmail: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        maxlength: 254,
      },

      businessPhone: {
        type: String,
        trim: true,
        maxlength: 40,
        default: undefined,
      },

      /* =====================================================
         WEBSITE
      ====================================================== */

      websiteUrl: {
        type: String,
        trim: true,
        maxlength: 500,
        default: undefined,
      },

      description: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: undefined,
      },

      /* =====================================================
         LOCATION
      ====================================================== */

      country: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
      },

      countryCode: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        minlength: 2,
        maxlength: 3,
      },

      /* =====================================================
         CURRENCY
      ====================================================== */

      defaultCurrency: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        minlength: 3,
        maxlength: 3,
        default: "BDT",
      },

      /* =====================================================
         MERCHANT STATUS
      ====================================================== */

      status: {
        type: String,

        enum: [
          "pending",
          "active",
          "suspended",
          "disabled",
        ],

        required: true,
        default: "pending",
        index: true,
      },

      /* =====================================================
         VERIFICATION
      ====================================================== */

      verificationStatus: {
        type: String,

        enum: [
          "not_started",
          "pending",
          "verified",
          "rejected",
        ],

        required: true,
        default: "not_started",
        index: true,
      },

      verifiedAt: {
        type: Date,
        default: undefined,
      },

      rejectedAt: {
        type: Date,
        default: undefined,
      },

      /* =====================================================
         SUSPENSION
      ====================================================== */

      suspendedAt: {
        type: Date,
        default: undefined,
      },

      suspendedReason: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: undefined,
      },

      /* =====================================================
         ENVIRONMENT ACCESS
      ====================================================== */

      /*
       * Test mode is available for development and integration.
       */
      testEnabled: {
        type: Boolean,
        default: true,
        required: true,
      },

      /*
       * Live mode must be explicitly enabled.
       */
      liveEnabled: {
        type: Boolean,
        default: false,
        required: true,
      },

      /* =====================================================
         ACTIVATION
      ====================================================== */

      activatedAt: {
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
 * One merchant record per owner account.
 *
 * A single User can therefore represent one merchant
 * business identity in this first version.
 */
merchantSchema.index(
  {
    ownerId: 1,
  },
  {
    unique: true,
    name: "unique_merchant_owner",
  }
);

/*
 * Merchant slug must be globally unique.
 */
merchantSchema.index(
  {
    slug: 1,
  },
  {
    unique: true,
    name: "unique_merchant_slug",
  }
);

/*
 * Merchant business email lookup.
 */
merchantSchema.index(
  {
    businessEmail: 1,
  },
  {
    name: "merchant_business_email",
  }
);

/*
 * Common administrative filter.
 */
merchantSchema.index(
  {
    status: 1,
    verificationStatus: 1,
    createdAt: -1,
  },
  {
    name: "merchant_status_verification_created_at",
  }
);

/*
 * Merchant activation reporting.
 */
merchantSchema.index(
  {
    liveEnabled: 1,
    status: 1,
    createdAt: -1,
  },
  {
    name: "merchant_live_status_created_at",
  }
);

/* =========================================================
   SAFE JSON
========================================================= */

merchantSchema.set(
  "toJSON",
  {
    virtuals: true,
  }
);

merchantSchema.set(
  "toObject",
  {
    virtuals: true,
  }
);

/* =========================================================
   MODEL
========================================================= */

const MerchantModel: Model<IMerchant> =
  (mongoose.models.Merchant as Model<IMerchant>) ||
  mongoose.model<IMerchant>(
    "Merchant",
    merchantSchema
  );

/* =========================================================
   EXPORTS
========================================================= */

export const Merchant =
  MerchantModel;

export default MerchantModel;