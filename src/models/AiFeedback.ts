import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

export interface IAiFeedback extends Document {
  ownerId: mongoose.Types.ObjectId;
  conversationId: string;
  messageId: string;
  rating: "helpful" | "not_helpful";
  actorType?: "user" | "merchant" | "support" | "analyst" | "admin" | "super_admin";
  intent?: string;
  reason?: "too_long" | "too_short" | "unclear" | "incorrect" | "irrelevant" | "other" | null;
  comment?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const aiFeedbackSchema =
  new Schema<IAiFeedback>(
    {
      ownerId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },
      conversationId: {
        type: String,
        required: true,
        trim: true,
        maxlength: 128,
      },
      messageId: {
        type: String,
        required: true,
        trim: true,
        maxlength: 128,
      },
      rating: {
        type: String,
        enum: ["helpful", "not_helpful"],
        required: true,
      },
      actorType: {
        type: String,
        enum: ["user", "merchant", "support", "analyst", "admin", "super_admin"],
        index: true,
      },
      intent: { type: String, maxlength: 80 },
      reason: {
        type: String,
        enum: ["too_long", "too_short", "unclear", "incorrect", "irrelevant", "other"],
        default: null,
      },
      comment: {
        type: String,
        required: false,
        trim: true,
        maxlength: 500,
      },
    },
    {
      timestamps: true,
    },
  );

aiFeedbackSchema.index(
  {
    ownerId: 1,
    messageId: 1,
  },
  {
    unique: true,
  },
);
aiFeedbackSchema.index({ ownerId: 1, actorType: 1, updatedAt: -1 });

export const AiFeedback =
  (mongoose.models
    .AiFeedback as Model<IAiFeedback> | undefined) ??
  mongoose.model<IAiFeedback>(
    "AiFeedback",
    aiFeedbackSchema,
  );

export default AiFeedback;
