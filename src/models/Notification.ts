import mongoose, {
  Document,
  Schema,
} from "mongoose";

export type NotificationType =
  | "SECURITY"
  | "TRANSACTION"
  | "BUDGET"
  | "KYC"
  | "RECEIPT"
  | "SYSTEM"
  // Legacy values kept readable while old data remains.
  | "TRANSFER"
  | "DEPOSIT"
  | "WITHDRAW";

export type NotificationPriority =
  | "CRITICAL"
  | "HIGH"
  | "NORMAL"
  | "LOW";

export interface IEncryptedNotificationValue {
  encrypted: string;
  iv: string;
  authTag: string;
}

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;

  titleEncrypted?: IEncryptedNotificationValue;
  messageEncrypted?: IEncryptedNotificationValue;
  amountEncrypted?: IEncryptedNotificationValue;
  merchantEncrypted?: IEncryptedNotificationValue;

  type: NotificationType;
  priority: NotificationPriority;

  isRead: boolean;
  isArchived: boolean;

  actionLink?: string;
  actionText?: string;

  relatedEntityType?: string;
  relatedEntityId?: mongoose.Types.ObjectId;

  createdBy: "SYSTEM" | "ADMIN";

  /* Legacy plaintext fields. New writes should not use these. */
  title?: string;
  message?: string;
  amount?: number;
  merchant?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

const encryptedValueSchema =
  new Schema<IEncryptedNotificationValue>(
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

const notificationSchema =
  new Schema<INotification>(
    {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      titleEncrypted: {
        type: encryptedValueSchema,
      },

      messageEncrypted: {
        type: encryptedValueSchema,
      },

      amountEncrypted: {
        type: encryptedValueSchema,
      },

      merchantEncrypted: {
        type: encryptedValueSchema,
      },

      type: {
        type: String,
        enum: [
          "SECURITY",
          "TRANSACTION",
          "BUDGET",
          "KYC",
          "RECEIPT",
          "SYSTEM",
          "TRANSFER",
          "DEPOSIT",
          "WITHDRAW",
        ],
        default: "SYSTEM",
      },

      priority: {
        type: String,
        enum: [
          "CRITICAL",
          "HIGH",
          "NORMAL",
          "LOW",
        ],
        default: "NORMAL",
      },

      isRead: {
        type: Boolean,
        default: false,
        index: true,
      },

      isArchived: {
        type: Boolean,
        default: false,
        index: true,
      },

      actionLink: {
        type: String,
        trim: true,
        maxlength: 300,
      },

      actionText: {
        type: String,
        trim: true,
        maxlength: 80,
      },

      relatedEntityType: {
        type: String,
        trim: true,
        maxlength: 40,
      },

      relatedEntityId: {
        type: Schema.Types.ObjectId,
      },

      createdBy: {
        type: String,
        enum: ["SYSTEM", "ADMIN"],
        default: "SYSTEM",
      },

      /* Legacy optional fields */
      title: {
        type: String,
        trim: true,
      },
      message: {
        type: String,
        trim: true,
      },
      amount: {
        type: Number,
        min: 0,
      },
      merchant: {
        type: String,
        trim: true,
      },
    },
    {
      timestamps: true,
    }
  );

notificationSchema.index({
  userId: 1,
  createdAt: -1,
});

notificationSchema.index({
  userId: 1,
  isArchived: 1,
  createdAt: -1,
});

export const Notification =
  mongoose.models.Notification ||
  mongoose.model<INotification>(
    "Notification",
    notificationSchema
  );

export default Notification;
