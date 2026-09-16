import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

/* =========================================================
   TYPES
========================================================= */

export type MerchantThemeMode =
  | "light"
  | "dark"
  | "system";

export type MerchantThemeAccent =
  | "purple"
  | "blue"
  | "emerald"
  | "rose"
  | "amber";

export type MerchantThemeDensity =
  | "comfortable"
  | "compact";

export type MerchantThemeRadius =
  | "soft"
  | "rounded"
  | "extra-rounded";

/* =========================================================
   SECTION INTERFACES
========================================================= */

export interface MerchantGeneralSettings {
  displayName?: string;

  supportEmail?: string;

  supportPhone?: string;

  website?: string;

  timezone: string;

  locale: string;
}

export interface MerchantBusinessAddress {
  line1?: string;

  line2?: string;

  city?: string;

  state?: string;

  postalCode?: string;

  country?: string;
}

export interface MerchantBusinessSettings {
  category?: string;

  publicDescription?: string;

  address:
    MerchantBusinessAddress;
}

export interface MerchantCheckoutSettings {
  defaultExpiryMinutes:
    number;

  collectCustomerName:
    boolean;

  collectCustomerEmail:
    boolean;

  defaultReturnUrl?: string;

  defaultCancelUrl?: string;

  checkoutNote?: string;
}

export interface MerchantBrandingSettings {
  checkoutDisplayName?: string;

  /*
   * Customer-facing hosted checkout accent.
   *
   * This is intentionally separate from dashboard theme.
   */
  checkoutAccentColor:
    string;

  logoUrl?: string;

  /*
   * Used only by backend when replacing/removing logo.
   * Never expose this to the browser.
   */
  logoPublicId?: string;
}

export interface MerchantThemeSettings {
  mode:
    MerchantThemeMode;

  accent:
    MerchantThemeAccent;

  density:
    MerchantThemeDensity;

  radius:
    MerchantThemeRadius;

  reducedMotion:
    boolean;

  compactSidebar:
    boolean;
}

export interface MerchantNotificationSettings {
  paymentCompleted:
    boolean;

  paymentFailed:
    boolean;

  refundCreated:
    boolean;

  payoutUpdates:
    boolean;

  securityAlerts:
    boolean;
}

export interface MerchantSecuritySettings {
  notifyOnApiKeyCreated:
    boolean;

  notifyOnApiKeyRotated:
    boolean;

  notifyOnWebhookSecretRotated:
    boolean;

  notifyOnPayoutRequest:
    boolean;
}

/* =========================================================
   DOCUMENT
========================================================= */

export interface IMerchantSettings
  extends Document {
  merchantId:
    mongoose.Types.ObjectId;

  general:
    MerchantGeneralSettings;

  business:
    MerchantBusinessSettings;

  checkout:
    MerchantCheckoutSettings;

  branding:
    MerchantBrandingSettings;

  theme:
    MerchantThemeSettings;

  notifications:
    MerchantNotificationSettings;

  security:
    MerchantSecuritySettings;

  revision:
    number;

  createdAt:
    Date;

  updatedAt:
    Date;
}

/* =========================================================
   GENERAL
========================================================= */

const generalSchema =
  new Schema<MerchantGeneralSettings>(
    {
      displayName: {
        type:
          String,

        trim:
          true,

        maxlength:
          120,

        default:
          undefined,
      },

      supportEmail: {
        type:
          String,

        trim:
          true,

        lowercase:
          true,

        maxlength:
          254,

        default:
          undefined,
      },

      supportPhone: {
        type:
          String,

        trim:
          true,

        maxlength:
          30,

        default:
          undefined,
      },

      website: {
        type:
          String,

        trim:
          true,

        maxlength:
          2048,

        default:
          undefined,
      },

      timezone: {
        type:
          String,

        trim:
          true,

        maxlength:
          100,

        default:
          "UTC",

        required:
          true,
      },

      locale: {
        type:
          String,

        trim:
          true,

        maxlength:
          20,

        default:
          "en",

        required:
          true,
      },
    },
    {
      _id:
        false,
    },
  );

/* =========================================================
   BUSINESS ADDRESS
========================================================= */

const businessAddressSchema =
  new Schema<MerchantBusinessAddress>(
    {
      line1: {
        type:
          String,

        trim:
          true,

        maxlength:
          180,

        default:
          undefined,
      },

      line2: {
        type:
          String,

        trim:
          true,

        maxlength:
          180,

        default:
          undefined,
      },

      city: {
        type:
          String,

        trim:
          true,

        maxlength:
          100,

        default:
          undefined,
      },

      state: {
        type:
          String,

        trim:
          true,

        maxlength:
          100,

        default:
          undefined,
      },

      postalCode: {
        type:
          String,

        trim:
          true,

        maxlength:
          40,

        default:
          undefined,
      },

      country: {
        type:
          String,

        trim:
          true,

        maxlength:
          100,

        default:
          undefined,
      },
    },
    {
      _id:
        false,
    },
  );

/* =========================================================
   BUSINESS
========================================================= */

const businessSchema =
  new Schema<MerchantBusinessSettings>(
    {
      category: {
        type:
          String,

        trim:
          true,

        maxlength:
          100,

        default:
          undefined,
      },

      publicDescription: {
        type:
          String,

        trim:
          true,

        maxlength:
          1000,

        default:
          undefined,
      },

      address: {
        type:
          businessAddressSchema,

        default:
          () => ({}),
      },
    },
    {
      _id:
        false,
    },
  );

/* =========================================================
   CHECKOUT
========================================================= */

const checkoutSchema =
  new Schema<MerchantCheckoutSettings>(
    {
      defaultExpiryMinutes: {
        type:
          Number,

        required:
          true,

        min:
          5,

        max:
          1440,

        default:
          30,
      },

      collectCustomerName: {
        type:
          Boolean,

        required:
          true,

        default:
          true,
      },

      collectCustomerEmail: {
        type:
          Boolean,

        required:
          true,

        default:
          true,
      },

      defaultReturnUrl: {
        type:
          String,

        trim:
          true,

        maxlength:
          2048,

        default:
          undefined,
      },

      defaultCancelUrl: {
        type:
          String,

        trim:
          true,

        maxlength:
          2048,

        default:
          undefined,
      },

      checkoutNote: {
        type:
          String,

        trim:
          true,

        maxlength:
          500,

        default:
          undefined,
      },
    },
    {
      _id:
        false,
    },
  );

/* =========================================================
   BRANDING
========================================================= */

const brandingSchema =
  new Schema<MerchantBrandingSettings>(
    {
      checkoutDisplayName: {
        type:
          String,

        trim:
          true,

        maxlength:
          120,

        default:
          undefined,
      },

      checkoutAccentColor: {
        type:
          String,

        trim:
          true,

        default:
          "#6D28D9",

        maxlength:
          7,

        required:
          true,
      },

      logoUrl: {
        type:
          String,

        trim:
          true,

        maxlength:
          2048,

        default:
          undefined,
      },

      logoPublicId: {
        type:
          String,

        trim:
          true,

        maxlength:
          500,

        select:
          false,

        default:
          undefined,
      },
    },
    {
      _id:
        false,
    },
  );

/* =========================================================
   THEME
========================================================= */

const themeSchema =
  new Schema<MerchantThemeSettings>(
    {
      mode: {
        type:
          String,

        enum: [
          "light",
          "dark",
          "system",
        ],

        default:
          "system",

        required:
          true,
      },

      accent: {
        type:
          String,

        enum: [
          "purple",
          "blue",
          "emerald",
          "rose",
          "amber",
        ],

        default:
          "purple",

        required:
          true,
      },

      density: {
        type:
          String,

        enum: [
          "comfortable",
          "compact",
        ],

        default:
          "comfortable",

        required:
          true,
      },

      radius: {
        type:
          String,

        enum: [
          "soft",
          "rounded",
          "extra-rounded",
        ],

        default:
          "rounded",

        required:
          true,
      },

      reducedMotion: {
        type:
          Boolean,

        default:
          false,

        required:
          true,
      },

      compactSidebar: {
        type:
          Boolean,

        default:
          false,

        required:
          true,
      },
    },
    {
      _id:
        false,
    },
  );

/* =========================================================
   NOTIFICATIONS
========================================================= */

const notificationSchema =
  new Schema<MerchantNotificationSettings>(
    {
      paymentCompleted: {
        type:
          Boolean,

        default:
          true,

        required:
          true,
      },

      paymentFailed: {
        type:
          Boolean,

        default:
          true,

        required:
          true,
      },

      refundCreated: {
        type:
          Boolean,

        default:
          true,

        required:
          true,
      },

      payoutUpdates: {
        type:
          Boolean,

        default:
          true,

        required:
          true,
      },

      securityAlerts: {
        type:
          Boolean,

        default:
          true,

        required:
          true,
      },
    },
    {
      _id:
        false,
    },
  );

/* =========================================================
   SECURITY
========================================================= */

const securitySchema =
  new Schema<MerchantSecuritySettings>(
    {
      notifyOnApiKeyCreated: {
        type:
          Boolean,

        default:
          true,

        required:
          true,
      },

      notifyOnApiKeyRotated: {
        type:
          Boolean,

        default:
          true,

        required:
          true,
      },

      notifyOnWebhookSecretRotated: {
        type:
          Boolean,

        default:
          true,

        required:
          true,
      },

      notifyOnPayoutRequest: {
        type:
          Boolean,

        default:
          true,

        required:
          true,
      },
    },
    {
      _id:
        false,
    },
  );

/* =========================================================
   ROOT SCHEMA
========================================================= */

const merchantSettingsSchema =
  new Schema<IMerchantSettings>(
    {
      merchantId: {
        type:
          Schema.Types.ObjectId,

        ref:
          "Merchant",

        required:
          true,

        unique:
          true,

        index:
          true,

        immutable:
          true,
      },

      general: {
        type:
          generalSchema,

        default:
          () => ({}),

        required:
          true,
      },

      business: {
        type:
          businessSchema,

        default:
          () => ({}),

        required:
          true,
      },

      checkout: {
        type:
          checkoutSchema,

        default:
          () => ({}),

        required:
          true,
      },

      branding: {
        type:
          brandingSchema,

        default:
          () => ({}),

        required:
          true,
      },

      theme: {
        type:
          themeSchema,

        default:
          () => ({}),

        required:
          true,
      },

      notifications: {
        type:
          notificationSchema,

        default:
          () => ({}),

        required:
          true,
      },

      security: {
        type:
          securitySchema,

        default:
          () => ({}),

        required:
          true,
      },

      revision: {
        type:
          Number,

        min:
          1,

        default:
          1,

        required:
          true,
      },
    },
    {
      timestamps:
        true,

      versionKey:
        false,

      strict:
        "throw",

      minimize:
        false,
    },
  );

/* =========================================================
   INDEX
========================================================= */

merchantSettingsSchema.index(
  {
    merchantId:
      1,
  },
  {
    unique:
      true,

    name:
      "unique_merchant_settings",
  },
);

/* =========================================================
   MODEL
========================================================= */

const MerchantSettingsModel:
  Model<IMerchantSettings> =
  (
    mongoose.models
      .MerchantSettings as
      Model<IMerchantSettings> |
      undefined
  ) ??
  mongoose.model<IMerchantSettings>(
    "MerchantSettings",
    merchantSettingsSchema,
  );

export const MerchantSettings =
  MerchantSettingsModel;

export default MerchantSettingsModel;