import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

export interface IAiMessageSource {
  type:
    | "payment_timeline"
    | "wallet_transaction_timeline"
    | "system_policy";
  label: string;
  reference: string;
}

export interface IAiMessageAction {
  label: string;
  href?: string;
}

export interface IAiMessage extends Document {
  messageId: string;
  conversationId: string;
  ownerId: mongoose.Types.ObjectId;
  role: "user" | "assistant";
  content: string;
  requestId: string;
  intent: string;
  verification: "verified" | "partial" | "unknown";
  confidence: "high" | "medium" | "low";
  subjectType?: "gateway_payment" | "wallet_transaction";
  resourceId?: string;
  sources: IAiMessageSource[];
  suggestedActions: IAiMessageAction[];
  createdAt?: Date;
  updatedAt?: Date;
}

const sourceSchema =
  new Schema<IAiMessageSource>(
    {
      type: {
        type: String,
        enum: [
          "payment_timeline",
          "wallet_transaction_timeline",
          "system_policy",
        ],
        required: true,
      },
      label: {
        type: String,
        required: true,
        maxlength: 160,
      },
      reference: {
        type: String,
        required: true,
        maxlength: 128,
      },
    },
    {
      _id: false,
    },
  );

const actionSchema =
  new Schema<IAiMessageAction>(
    {
      label: {
        type: String,
        required: true,
        maxlength: 160,
      },
      href: {
        type: String,
        required: false,
        maxlength: 300,
      },
    },
    {
      _id: false,
    },
  );

const aiMessageSchema =
  new Schema<IAiMessage>(
    {
      messageId: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        maxlength: 128,
      },
      conversationId: {
        type: String,
        required: true,
        trim: true,
        index: true,
        maxlength: 128,
      },
      ownerId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },
      role: {
        type: String,
        enum: ["user", "assistant"],
        required: true,
      },
      content: {
        type: String,
        required: true,
        maxlength: 5000,
      },
      requestId: {
        type: String,
        required: true,
        maxlength: 128,
      },
      intent: {
        type: String,
        required: true,
        maxlength: 80,
      },
      verification: {
        type: String,
        enum: ["verified", "partial", "unknown"],
        required: true,
        default: "unknown",
      },
      confidence: {
        type: String,
        enum: ["high", "medium", "low"],
        required: true,
        default: "low",
      },
      subjectType: {
        type: String,
        enum: ["gateway_payment", "wallet_transaction"],
        required: false,
      },
      resourceId: {
        type: String,
        required: false,
        maxlength: 128,
      },
      sources: {
        type: [sourceSchema],
        required: true,
        default: [],
      },
      suggestedActions: {
        type: [actionSchema],
        required: true,
        default: [],
      },
    },
    {
      timestamps: true,
    },
  );

aiMessageSchema.index({
  ownerId: 1,
  conversationId: 1,
  createdAt: 1,
});

export const AiMessage =
  (mongoose.models
    .AiMessage as Model<IAiMessage> | undefined) ??
  mongoose.model<IAiMessage>(
    "AiMessage",
    aiMessageSchema,
  );

export default AiMessage;
