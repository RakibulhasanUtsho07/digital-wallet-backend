import mongoose, {
  Document,
  Schema,
} from "mongoose";

/* =========================================================
   TYPES
========================================================= */

export type SystemLogLevel =
  | "TRACE"
  | "DEBUG"
  | "INFO"
  | "NOTICE"
  | "WARN"
  | "ERROR"
  | "CRITICAL";

export type SystemLogService =
  | "API"
  | "Authentication"
  | "Database"
  | "Wallet"
  | "Transactions"
  | "Transfers"
  | "KYC"
  | "Notifications"
  | "Cloudinary"
  | "AI"
  | "Background Jobs"
  | "System"
  | "Security"
  | "Support"
  | "Revenue";

export type SystemLogEnvironment =
  | "Development"
  | "Staging"
  | "Production";

export type SystemLogResult =
  | "Success"
  | "Failed"
  | "Timeout"
  | "Retried";

/* =========================================================
   INTERFACE
========================================================= */

export interface ISystemLog
  extends Document {
  timestamp:
    Date;

  level:
    SystemLogLevel;

  service:
    SystemLogService;

  category:
    string;

  event:
    string;

  message:
    string;

  requestId?:
    string;

  traceId?:
    string;

  transactionId?:
    string;

  source:
    string;

  endpoint?:
    string;

  method?:
    string;

  statusCode?:
    number;

  durationMs?:
    number;

  environment:
    SystemLogEnvironment;

  result:
    SystemLogResult;

  createdAt:
    Date;

  updatedAt:
    Date;
}

/* =========================================================
   RETENTION
========================================================= */

const retentionDays =
  Math.max(
    1,
    Number(
      process.env
        .SYSTEM_LOG_RETENTION_DAYS ??
        30
    ) || 30
  );

const retentionSeconds =
  retentionDays *
  24 *
  60 *
  60;

/* =========================================================
   SCHEMA
========================================================= */

const systemLogSchema =
  new Schema<ISystemLog>(
    {
      timestamp: {
        type:
          Date,

        default:
          Date.now,

        required:
          true,

        index:
          true,
      },

      level: {
        type:
          String,

        enum: [
          "TRACE",
          "DEBUG",
          "INFO",
          "NOTICE",
          "WARN",
          "ERROR",
          "CRITICAL",
        ],

        required:
          true,

        index:
          true,
      },

      service: {
        type:
          String,

        enum: [
          "API",
          "Authentication",
          "Database",
          "Wallet",
          "Transactions",
          "Transfers",
          "KYC",
          "Notifications",
          "Cloudinary",
          "AI",
          "Background Jobs",
          "System",
          "Security",
          "Support",
          "Revenue",
        ],

        required:
          true,

        index:
          true,
      },

      category: {
        type:
          String,

        required:
          true,

        trim:
          true,

        maxlength:
          80,
      },

      event: {
        type:
          String,

        required:
          true,

        trim:
          true,

        maxlength:
          160,
      },

      message: {
        type:
          String,

        required:
          true,

        trim:
          true,

        maxlength:
          1200,
      },

      requestId: {
        type:
          String,

        trim:
          true,

        maxlength:
          120,

        index:
          true,
      },

      traceId: {
        type:
          String,

        trim:
          true,

        maxlength:
          120,

        index:
          true,
      },

      transactionId: {
        type:
          String,

        trim:
          true,

        maxlength:
          120,

        index:
          true,
      },

      source: {
        type:
          String,

        required:
          true,

        trim:
          true,

        maxlength:
          80,
      },

      endpoint: {
        type:
          String,

        trim:
          true,

        maxlength:
          260,
      },

      method: {
        type:
          String,

        trim:
          true,

        maxlength:
          16,
      },

      statusCode: {
        type:
          Number,

        min:
          100,

        max:
          599,
      },

      durationMs: {
        type:
          Number,

        min:
          0,

        max:
          60 *
          60 *
          1000,
      },

      environment: {
        type:
          String,

        enum: [
          "Development",
          "Staging",
          "Production",
        ],

        required:
          true,

        index:
          true,
      },

      result: {
        type:
          String,

        enum: [
          "Success",
          "Failed",
          "Timeout",
          "Retried",
        ],

        required:
          true,

        index:
          true,
      },
    },
    {
      timestamps:
        true,

      versionKey:
        false,

      strict:
        "throw",

      minimize:
        false,
    }
  );

/* =========================================================
   INDEXES
========================================================= */

systemLogSchema.index({
  timestamp:
    -1,
});

systemLogSchema.index({
  service:
    1,

  timestamp:
    -1,
});

systemLogSchema.index({
  level:
    1,

  timestamp:
    -1,
});

systemLogSchema.index({
  environment:
    1,

  timestamp:
    -1,
});

systemLogSchema.index({
  requestId:
    1,

  timestamp:
    1,
});

systemLogSchema.index({
  traceId:
    1,

  timestamp:
    1,
});

systemLogSchema.index({
  createdAt:
    1,
}, {
  expireAfterSeconds:
    retentionSeconds,
});

/* =========================================================
   MODEL
========================================================= */

export const SystemLog =
  mongoose.models.SystemLog ||
  mongoose.model<ISystemLog>(
    "SystemLog",
    systemLogSchema
  );

export default SystemLog;
