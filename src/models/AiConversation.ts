import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

export interface IAiConversation extends Document {
  conversationId: string;
  ownerId: mongoose.Types.ObjectId;
  actorType: "user" | "merchant";
  title: string;
  lastIntent: string;
  lastMessageAt: Date;
  messageCount: number;
  archived: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const aiConversationSchema =
  new Schema<IAiConversation>(
    {
      conversationId: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        maxlength: 128,
      },
      ownerId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },
      actorType: {
        type: String,
        enum: ["user", "merchant"],
        required: true,
      },
      title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
      },
      lastIntent: {
        type: String,
        required: true,
        trim: true,
        maxlength: 80,
      },
      lastMessageAt: {
        type: Date,
        required: true,
        default: Date.now,
      },
      messageCount: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
      },
      archived: {
        type: Boolean,
        required: true,
        default: false,
      },
    },
    {
      timestamps: true,
    },
  );

aiConversationSchema.index({
  ownerId: 1,
  archived: 1,
  lastMessageAt: -1,
});

export const AiConversation =
  (mongoose.models
    .AiConversation as Model<IAiConversation> | undefined) ??
  mongoose.model<IAiConversation>(
    "AiConversation",
    aiConversationSchema,
  );

export default AiConversation;
