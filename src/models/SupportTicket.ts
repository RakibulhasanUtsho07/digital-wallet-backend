import mongoose, {
  Document,
  Schema,
} from "mongoose";

import type {
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
  SupportWaitingOn,
} from "../types/support.js";

export interface ISupportTicket
  extends Document {
  ticketNumber: string;
  customerUserId: mongoose.Types.ObjectId;
  subject: string;
  descriptionEncrypted: {
    encrypted: string;
    iv: string;
    authTag: string;
  };
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  waitingOn: SupportWaitingOn;
  assigneeAdminId?: mongoose.Types.ObjectId;
  relatedReference?: string;
  tags: string[];
  slaDueAt: Date;
  firstResponseAt?: Date;
  resolvedAt?: Date;
  resolutionEncrypted?: {
    encrypted: string;
    iv: string;
    authTag: string;
  };
  csatScore?: number;
  lastActivityAt: Date;
  createdByAdminId: mongoose.Types.ObjectId;
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

const supportTicketSchema =
  new Schema<ISupportTicket>(
    {
      ticketNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true,
      },

      customerUserId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      subject: {
        type: String,
        required: true,
        trim: true,
        minlength: 4,
        maxlength: 180,
      },

      descriptionEncrypted: {
        type: encryptedDataSchema,
        required: true,
      },

      category: {
        type: String,
        enum: [
          "Transfer",
          "Withdrawal",
          "Deposit",
          "KYC",
          "Security",
          "Account",
          "Payment",
          "Other",
        ],
        required: true,
        index: true,
      },

      priority: {
        type: String,
        enum: [
          "Low",
          "Normal",
          "High",
          "Urgent",
        ],
        default: "Normal",
        index: true,
      },

      status: {
        type: String,
        enum: [
          "Open",
          "Waiting for Customer",
          "In Progress",
          "Escalated",
          "Resolved",
        ],
        default: "Open",
        index: true,
      },

      waitingOn: {
        type: String,
        enum: [
          "admin",
          "customer",
          "none",
        ],
        default: "admin",
        index: true,
      },

      assigneeAdminId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        index: true,
      },

      relatedReference: {
        type: String,
        trim: true,
        maxlength: 180,
      },

      tags: {
        type: [{
          type: String,
          trim: true,
          maxlength: 40,
        }],
        default: [],
      },

      slaDueAt: {
        type: Date,
        required: true,
        index: true,
      },

      firstResponseAt: {
        type: Date,
      },

      resolvedAt: {
        type: Date,
        index: true,
      },

      resolutionEncrypted: {
        type: encryptedDataSchema,
      },

      csatScore: {
        type: Number,
        min: 1,
        max: 100,
      },

      lastActivityAt: {
        type: Date,
        default: Date.now,
        index: true,
      },

      createdByAdminId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    },
    {
      timestamps: true,
      versionKey: false,
      strict: "throw",
      minimize: false,
    }
  );

supportTicketSchema.index({
  status: 1,
  lastActivityAt: -1,
});

supportTicketSchema.index({
  priority: 1,
  slaDueAt: 1,
});

supportTicketSchema.index({
  customerUserId: 1,
  createdAt: -1,
});

export const SupportTicket =
  mongoose.models.SupportTicket ||
  mongoose.model<ISupportTicket>(
    "SupportTicket",
    supportTicketSchema
  );

export default SupportTicket;
