import mongoose, {
  Document,
  Schema,
} from "mongoose";

/* =========================================================
   ENCRYPTED DATA TYPE
========================================================= */

export interface IEncryptedSettingsValue {
  encrypted: string;
  iv: string;
  authTag: string;
}

/* =========================================================
   THEME TYPE
========================================================= */

export type SettingsTheme =
  | "light"
  | "dark"
  | "eye-care"
  | "ocean"
  | "forest";

/* =========================================================
   USER SETTINGS INTERFACE
========================================================= */

export interface IUserSettings
  extends Document {
  userId:
    mongoose.Types.ObjectId;

  appearance: {
    theme:
      | "light"
      | "dark"
      | "eye-care"
      | "ocean"
      | "forest";

    density:
      | "comfortable"
      | "compact";

    reduceMotion: boolean;
  };

  notifications: {
    email: boolean;

    push: boolean;

    sms: boolean;

    marketing: boolean;
  };

  privacy: {
    analytics: boolean;

    discoverability: boolean;

    personalization: boolean;

    showTransactionNames: boolean;
  };

  wallet: {
    defaultCurrency:
      | "BDT"
      | "USD"
      | "EUR";

    hideAmounts: boolean;

    requireConfirmation: boolean;

    confirmThresholdEncrypted?: IEncryptedSettingsValue;
  };

  createdAt: Date;

  updatedAt: Date;
}

/* =========================================================
   ENCRYPTED SUB-SCHEMA
========================================================= */

const encryptedSettingsValueSchema =
  new Schema<IEncryptedSettingsValue>(
    {
      encrypted: {
        type: String,
        required: true,
      },

      iv: {
        type: String,
        required: true,
      },

      authTag: {
        type: String,
        required: true,
      },
    },

    {
      _id: false,
    }
  );

/* =========================================================
   USER SETTINGS SCHEMA
========================================================= */

const userSettingsSchema =
  new Schema<IUserSettings>(
    {
      /* =====================================================
         USER
      ====================================================== */

      userId: {
        type:
          Schema.Types.ObjectId,

        ref:
          "User",

        required:
          true,

        unique:
          true,

        index:
          true,
      },

      /* =====================================================
         APPEARANCE
      ====================================================== */

      appearance: {
        theme: {
          type: String,

          /*
           * IMPORTANT:
           *
           * Must match ThemeContext.tsx
           */

          enum: [
            "light",
            "dark",
            "eye-care",
            "ocean",
            "forest",
          ],

          default:
            "light",
        },

        density: {
          type: String,

          enum: [
            "comfortable",
            "compact",
          ],

          default:
            "comfortable",
        },

        reduceMotion: {
          type: Boolean,

          default:
            false,
        },
      },

      /* =====================================================
         NOTIFICATIONS
      ====================================================== */

      notifications: {
        email: {
          type: Boolean,
          default: true,
        },

        push: {
          type: Boolean,
          default: true,
        },

        sms: {
          type: Boolean,
          default: true,
        },

        marketing: {
          type: Boolean,
          default: false,
        },
      },

      /* =====================================================
         PRIVACY
      ====================================================== */

      privacy: {
        analytics: {
          type: Boolean,
          default: false,
        },

        discoverability: {
          type: Boolean,
          default: true,
        },

        personalization: {
          type: Boolean,
          default: true,
        },

        showTransactionNames: {
          type: Boolean,
          default: true,
        },
      },

      /* =====================================================
         WALLET
      ====================================================== */

      wallet: {
        defaultCurrency: {
          type: String,

          enum: [
            "BDT",
            "USD",
            "EUR",
          ],

          default:
            "BDT",
        },

        hideAmounts: {
          type: Boolean,

          default:
            false,
        },

        requireConfirmation: {
          type: Boolean,

          default:
            true,
        },

        /*
         * Encrypted monetary preference
         */

        confirmThresholdEncrypted: {
          type:
            encryptedSettingsValueSchema,
        },
      },
    },

    {
      timestamps:
        true,
    }
  );

/* =========================================================
   MODEL
========================================================= */

export const UserSettings =
  mongoose.models.UserSettings ||
  mongoose.model<IUserSettings>(
    "UserSettings",
    userSettingsSchema
  );

export default UserSettings;