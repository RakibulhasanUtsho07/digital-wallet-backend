import mongoose, {
  Document,
  Schema,
} from "mongoose";

import type {
  SupportActivityType,
} from "../types/support.js";

export interface ISupportActivity
  extends Document {
  ticketId: mongoose.Types.ObjectId;
  eventType: SupportActivityType;
  summary: string;
  actorAdminId?: mongoose.Types.ObjectId;
  actorUserId?: mongoose.Types.ObjectId;
  actorName: string;
  createdAt: Date;
  updatedAt: Date;
}

const supportActivitySchema =
  new Schema<ISupportActivity>(
    {
      ticketId: {
        type: Schema.Types.ObjectId,
        ref: "SupportTicket",
        required: true,
        index: true,
      },

      eventType: {
        type: String,
        enum: [
          "TICKET_CREATED",
          "STATUS_CHANGED",
          "PRIORITY_CHANGED",
          "CATEGORY_CHANGED",
          "ASSIGNEE_CHANGED",
          "CUSTOMER_REPLY",
          "ADMIN_REPLY",
          "INTERNAL_NOTE",
          "ESCALATED",
          "RESOLVED",
          "REOPENED",
        ],
        required: true,
        index: true,
      },

      summary: {
        type: String,
        required: true,
        trim: true,
        maxlength: 240,
      },

      actorAdminId: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },

      actorUserId: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },

      actorName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
      },
    },
    {
      timestamps: true,
      versionKey: false,
      strict: "throw",
    }
  );

supportActivitySchema.index({
  ticketId: 1,
  createdAt: -1,
});

export const SupportActivity =
  mongoose.models.SupportActivity ||
  mongoose.model<ISupportActivity>(
    "SupportActivity",
    supportActivitySchema
  );

export default SupportActivity;
