import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

export interface IAiAuditLog extends Document {
  eventType: string;
  requestId: string;
  actorType: string;
  actorRef?: string;
  intent?: string;
  toolId?: string;
  reasonCode?: string;
  metadata: Record<string, string | number | boolean | null>;
  eventCreatedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const aiAuditLogSchema =
  new Schema<IAiAuditLog>(
    {
      eventType: {
        type: String,
        required: true,
        index: true,
        maxlength: 80,
      },
      requestId: {
        type: String,
        required: true,
        index: true,
        maxlength: 128,
      },
      actorType: {
        type: String,
        required: true,
        maxlength: 40,
      },
      actorRef: {
        type: String,
        required: false,
        maxlength: 64,
      },
      intent: {
        type: String,
        required: false,
        maxlength: 80,
      },
      toolId: {
        type: String,
        required: false,
        maxlength: 100,
      },
      reasonCode: {
        type: String,
        required: false,
        maxlength: 100,
      },
      metadata: {
        type: Schema.Types.Mixed,
        required: true,
        default: {},
      },
      eventCreatedAt: {
        type: Date,
        required: true,
        index: true,
      },
    },
    {
      timestamps: true,
    },
  );

aiAuditLogSchema.index({
  actorRef: 1,
  eventCreatedAt: -1,
});

export const AiAuditLog =
  (mongoose.models
    .AiAuditLog as Model<IAiAuditLog> | undefined) ??
  mongoose.model<IAiAuditLog>(
    "AiAuditLog",
    aiAuditLogSchema,
  );

export default AiAuditLog;
