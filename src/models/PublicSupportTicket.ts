import mongoose, {
  type Document,
  type Model,
  Schema,
} from "mongoose";

export type SupportCategory =
  | "transfer"
  | "wallet"
  | "account"
  | "verification"
  | "other";

export type SupportTicketStatus =
  | "open"
  | "pending"
  | "in_progress"
  | "resolved"
  | "closed"
  | "overdue";

export interface IEncryptedSupportValue {
  encrypted: string;
  iv: string;
  authTag: string;
}

export interface ISupportTicket extends Document {
  ticketNumber: string;
  userId?: mongoose.Types.ObjectId;
  category: SupportCategory;
  messageEncrypted: IEncryptedSupportValue;
  contactEmailEncrypted?: IEncryptedSupportValue;
  status: SupportTicketStatus;
  priority: "low" | "normal" | "high";
  source: "landing_page" | "dashboard";
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const encryptedValueSchema = new Schema<IEncryptedSupportValue>(
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

const supportTicketSchema = new Schema<ISupportTicket>(
  {
    ticketNumber: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
      maxlength: 40,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: undefined,
      index: true,
    },
    category: {
      type: String,
      enum: ["transfer", "wallet", "account", "verification", "other"],
      required: true,
      index: true,
    },
    messageEncrypted: {
      type: encryptedValueSchema,
      required: true,
      select: false,
    },
    contactEmailEncrypted: {
      type: encryptedValueSchema,
      default: undefined,
      select: false,
    },
    status: {
      type: String,
      enum: [
        "open",
        "pending",
        "in_progress",
        "resolved",
        "closed",
        "overdue",
      ],
      default: "open",
      required: true,
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "normal", "high"],
      default: "normal",
      required: true,
      index: true,
    },
    source: {
      type: String,
      enum: ["landing_page", "dashboard"],
      default: "landing_page",
      required: true,
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: 220,
      default: undefined,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: "supporttickets",
  }
);

supportTicketSchema.index({ status: 1, createdAt: -1 });
supportTicketSchema.index({ category: 1, createdAt: -1 });
supportTicketSchema.index({ priority: 1, createdAt: -1 });

export const PublicSupportTicket: Model<ISupportTicket> =
  (mongoose.models.PublicSupportTicket as Model<ISupportTicket>) ||
  mongoose.model<ISupportTicket>(
    "PublicSupportTicket",
    supportTicketSchema
  );

export default PublicSupportTicket;
