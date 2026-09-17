import mongoose, {
  Document,
  Schema,
} from "mongoose";

/* =========================================================
   TYPES
========================================================= */

export type PlatformCurrency =
  | "BDT"
  | "USD"
  | "EUR";

/* =========================================================
   INTERFACE
========================================================= */

export interface IPlatformSettings
  extends Document {
  /*
   * Singleton key.
   * Only one global platform-settings document should exist.
   */
  key:
    "global";

  platform: {
    maintenanceMode:
      boolean;

    allowSignups:
      boolean;

    defaultCurrency:
      PlatformCurrency;
  };

  risk: {
    dailyTransferLimit:
      number;

    reviewThreshold:
      number;

    requireKycForHighValue:
      boolean;

    velocityWindowMinutes:
      number;

    maxTransfersPerWindow:
      number;
  };

  security: {
    requireMfa:
      boolean;

    sessionTimeoutMins:
      number;

    maxLoginAttempts:
      number;

    requireReauthForSensitiveActions:
      boolean;
  };

  /*
   * Revision is incremented on every material settings update.
   * It is used for optimistic concurrency protection.
   */
  revision:
    number;

  updatedBy?:
    mongoose.Types.ObjectId;

  createdAt:
    Date;

  updatedAt:
    Date;
}

/* =========================================================
   SCHEMA
========================================================= */

const platformSettingsSchema =
  new Schema<IPlatformSettings>(
    {
      key: {
        type:
          String,

        enum: [
          "global",
        ],

        default:
          "global",

        unique:
          true,

        immutable:
          true,

        required:
          true,
      },

      /* =====================================================
         PLATFORM
      ====================================================== */

      platform: {
        maintenanceMode: {
          type:
            Boolean,

          default:
            false,

          required:
            true,
        },

        allowSignups: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        defaultCurrency: {
          type:
            String,

          enum: [
            "BDT",
            "USD",
            "EUR",
          ],

          default:
            "BDT",

          required:
            true,
        },
      },

      /* =====================================================
         TRANSACTION RISK
      ====================================================== */

      risk: {
        dailyTransferLimit: {
          type:
            Number,

          default:
            50000,

          min:
            10000,

          max:
            500000,

          required:
            true,
        },

        reviewThreshold: {
          type:
            Number,

          default:
            25000,

          min:
            5000,

          max:
            100000,

          required:
            true,
        },

        requireKycForHighValue: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        velocityWindowMinutes: {
          type:
            Number,

          default:
            30,

          min:
            5,

          max:
            120,

          required:
            true,
        },

        maxTransfersPerWindow: {
          type:
            Number,

          default:
            8,

          min:
            2,

          max:
            30,

          required:
            true,
        },
      },

      /* =====================================================
         SECURITY POLICY
      ====================================================== */

      security: {
        requireMfa: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },

        sessionTimeoutMins: {
          type:
            Number,

          enum: [
            15,
            30,
            60,
            240,
          ],

          default:
            30,

          required:
            true,
        },

        maxLoginAttempts: {
          type:
            Number,

          default:
            5,

          min:
            3,

          max:
            10,

          required:
            true,
        },

        requireReauthForSensitiveActions: {
          type:
            Boolean,

          default:
            true,

          required:
            true,
        },
      },

      /* =====================================================
         REVISION / ACTOR
      ====================================================== */

      revision: {
        type:
          Number,

        default:
          1,

        min:
          1,

        required:
          true,
      },

      updatedBy: {
        type:
          Schema.Types.ObjectId,

        ref:
          "User",
      },
    },
    {
      timestamps:
        true,

      /*
       * We use our own explicit revision field.
       */
      versionKey:
        false,

      /*
       * Reject unexpected fields instead of silently storing
       * configuration that the backend does not understand.
       */
      strict:
        "throw",

      minimize:
        false,
    }
  );

/* =========================================================
   INDEXES
========================================================= */

platformSettingsSchema.index(
  {
    key:
      1,
  },
  {
    unique:
      true,
  }
);

/* =========================================================
   MODEL
========================================================= */

export const PlatformSettings =
  mongoose.models.PlatformSettings ||
  mongoose.model<IPlatformSettings>(
    "PlatformSettings",
    platformSettingsSchema
  );

export default PlatformSettings;
