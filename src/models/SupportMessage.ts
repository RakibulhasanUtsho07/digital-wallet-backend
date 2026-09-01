import mongoose, {
  Document,
  Schema,
} from "mongoose";

import type {
  SupportAuthorType,
  SupportMessageVisibility,
} from "../types/support.js";

export interface ISupportMessage
  extends Document {
  ticketId: mongoose.Types.ObjectId;
  visibility: SupportMessageVisibility;
  authorType: SupportAuthorType;
  authorUserId?: mongoose.Types.ObjectId;
  authorAdminId?: mongoose.Types.ObjectId;
  bodyEncrypted: {
    encrypted: string;
    iv: string;
    authTag: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const encryptedDataSchema =
  new Schema(
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

const supportMessageSchema =
  new Schema<ISupportMessage>(
    {
      ticketId: {
        type: Schema.Types.ObjectId,
        ref: "SupportTicket",
        required: true,
        index: true,
      },

      visibility: {
        type: String,
        enum: [
          "public",
          "internal",
        ],
        required: true,
        index: true,
      },

      authorType: {
        type: String,
        enum: [
          "admin",
          "customer",
          "system",
        ],
        required: true,
      },

      authorUserId: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },

      authorAdminId: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },

      bodyEncrypted: {
        type: encryptedDataSchema,
        required: true,
      },
    },
    {
      timestamps: true,
      versionKey: false,
      strict: "throw",
    }
  );

supportMessageSchema.index({
  ticketId: 1,
  createdAt: 1,
});

export const SupportMessage =
  mongoose.models.SupportMessage ||
  mongoose.model<ISupportMessage>(
    "SupportMessage",
    supportMessageSchema
  );

export default SupportMessage;
