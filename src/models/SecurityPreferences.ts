import mongoose, {
  Document,
  Schema,
} from "mongoose";

export type TwoFactorMethod =
  | "app"
  | "email"
  | "sms";

export interface IEncryptedSecurityValue {
  encrypted: string;
  iv: string;
  authTag: string;
}

export interface ISecurityPreferences
  extends Document {
  userId: mongoose.Types.ObjectId;

  twoFactor: {
    enabled: boolean;
    method: TwoFactorMethod;
    secretEncrypted?: IEncryptedSecurityValue;
    pendingSecretEncrypted?: IEncryptedSecurityValue;
    backupCodeHashes: string[];
    enabledAt?: Date;
  };

  alerts: {
    newDevice: boolean;
    suspiciousActivity: boolean;
    failedLogin: boolean;
  };

  lastSecurityCheckAt?: Date;
  securityCheckCount: number;

  createdAt: Date;
  updatedAt: Date;
}

const encryptedValueSchema =
  new Schema<IEncryptedSecurityValue>(
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

const securityPreferencesSchema =
  new Schema<ISecurityPreferences>(
    {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true,
        index: true,
      },

      twoFactor: {
        enabled: {
          type: Boolean,
          default: false,
        },
        method: {
          type: String,
          enum: [
            "app",
            "email",
            "sms",
          ],
          default: "app",
        },
        secretEncrypted: {
          type: encryptedValueSchema,
        },
        pendingSecretEncrypted: {
          type: encryptedValueSchema,
        },
        backupCodeHashes: {
          type: [String],
          default: [],
          select: false,
        },
        enabledAt: {
          type: Date,
        },
      },

      alerts: {
        newDevice: {
          type: Boolean,
          default: true,
        },
        suspiciousActivity: {
          type: Boolean,
          default: true,
        },
        failedLogin: {
          type: Boolean,
          default: true,
        },
      },

      lastSecurityCheckAt: {
        type: Date,
      },

      securityCheckCount: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
    {
      timestamps: true,
      versionKey: false,
    }
  );

export const SecurityPreferences =
  mongoose.models.SecurityPreferences ||
  mongoose.model<ISecurityPreferences>(
    "SecurityPreferences",
    securityPreferencesSchema
  );

export default SecurityPreferences;
