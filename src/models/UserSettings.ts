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
      | "system";

    density:
      | "comfortable"
      | "compact";

    reduceMotion:
      boolean;
  };

  notifications: {
    email:
      boolean;

    push:
      boolean;

    sms:
      boolean;

    marketing:
      boolean;
  };

  privacy: {
    analytics:
      boolean;

    discoverability:
      boolean;

    personalization:
      boolean;

    showTransactionNames:
      boolean;
  };

  wallet: {
    defaultCurrency:
      | "BDT"
      | "USD"
      | "EUR";

    hideAmounts:
      boolean;

    requireConfirmation:
      boolean;

    /*
     * Monetary preference is encrypted at rest
     * to match the project's financial-data
     * confidentiality model.
     */
    confirmThresholdEncrypted?:
      IEncryptedSettingsValue;
  };

  createdAt:
    Date;

  updatedAt:
    Date;
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

      appearance: {
        theme: {
          type: String,

          enum: [
            "light",
            "dark",
            "system",
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
          default: false,
        },
      },

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
          default: false,
        },

        requireConfirmation: {
          type: Boolean,
          default: true,
        },

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
