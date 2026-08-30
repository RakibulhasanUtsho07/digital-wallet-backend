import mongoose, {
  Document,
  Schema,
} from "mongoose";

export type SecurityEventStatus =
  | "success"
  | "warning"
  | "info";

export type SecurityEventType =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "SUSPICIOUS_LOGIN"
  | "SESSION_REVOKED"
  | "OTHER_SESSIONS_REVOKED"
  | "PASSWORD_CHANGED"
  | "TWO_FACTOR_SETUP_STARTED"
  | "TWO_FACTOR_ENABLED"
  | "TWO_FACTOR_DISABLED"
  | "TWO_FACTOR_METHOD_CHANGED"
  | "BACKUP_CODES_REGENERATED"
  | "ALERT_PREFERENCES_UPDATED"
  | "SECURITY_CHECK_RUN"
  | "WALLET_FROZEN"
  | "WALLET_UNFROZEN";

export interface ISecurityEvent
  extends Document {
  userId: mongoose.Types.ObjectId;
  eventType: SecurityEventType;
  title: string;
  status: SecurityEventStatus;
  detail?: string;

  sessionId?: string;
  device?: string;
  location?: string;
  maskedIp?: string;

  createdAt: Date;
  updatedAt: Date;
}

const securityEventSchema =
  new Schema<ISecurityEvent>(
    {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      eventType: {
        type: String,
        required: true,
        index: true,
      },

      title: {
        type: String,
        required: true,
        maxlength: 160,
      },

      status: {
        type: String,
        enum: [
          "success",
          "warning",
          "info",
        ],
        required: true,
        index: true,
      },

      detail: {
        type: String,
        maxlength: 500,
      },

      sessionId: {
        type: String,
        maxlength: 100,
      },
      device: {
        type: String,
        maxlength: 120,
      },
      location: {
        type: String,
        maxlength: 140,
      },
      maskedIp: {
        type: String,
        maxlength: 120,
      },
    },
    {
      timestamps: true,
      versionKey: false,
    }
  );

securityEventSchema.index({
  userId: 1,
  createdAt: -1,
});

securityEventSchema.index({
  userId: 1,
  eventType: 1,
  createdAt: -1,
});

export const SecurityEvent =
  mongoose.models.SecurityEvent ||
  mongoose.model<ISecurityEvent>(
    "SecurityEvent",
    securityEventSchema
  );

export default SecurityEvent;
