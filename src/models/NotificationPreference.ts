import mongoose, {
  Document,
  Schema,
} from "mongoose";

export interface INotificationPreference
  extends Document {
  userId: mongoose.Types.ObjectId;

  channels: {
    inApp: boolean;
    email: boolean;
    push: boolean;
  };

  categories: {
    security: boolean;
    transaction: boolean;
    budget: boolean;
    kyc: boolean;
    receipt: boolean;
    system: boolean;
  };

  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
  };

  digest: "off" | "daily" | "weekly";

  createdAt?: Date;
  updatedAt?: Date;
}

const notificationPreferenceSchema =
  new Schema<INotificationPreference>(
    {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true,
        index: true,
      },

      channels: {
        inApp: {
          type: Boolean,
          default: true,
        },
        email: {
          type: Boolean,
          default: true,
        },
        push: {
          type: Boolean,
          default: false,
        },
      },

      categories: {
        security: {
          type: Boolean,
          default: true,
        },
        transaction: {
          type: Boolean,
          default: true,
        },
        budget: {
          type: Boolean,
          default: true,
        },
        kyc: {
          type: Boolean,
          default: true,
        },
        receipt: {
          type: Boolean,
          default: true,
        },
        system: {
          type: Boolean,
          default: true,
        },
      },

      quietHours: {
        enabled: {
          type: Boolean,
          default: false,
        },
        start: {
          type: String,
          default: "22:00",
          match: /^([01]\d|2[0-3]):[0-5]\d$/,
        },
        end: {
          type: String,
          default: "07:00",
          match: /^([01]\d|2[0-3]):[0-5]\d$/,
        },
      },

      digest: {
        type: String,
        enum: [
          "off",
          "daily",
          "weekly",
        ],
        default: "daily",
      },
    },
    {
      timestamps: true,
    }
  );

export const NotificationPreference =
  mongoose.models.NotificationPreference ||
  mongoose.model<INotificationPreference>(
    "NotificationPreference",
    notificationPreferenceSchema
  );

export default NotificationPreference;
