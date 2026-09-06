import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

/* =========================================================
   TYPES
========================================================= */

export interface IEmailVerificationCode
  extends Document {
  emailLookup: string;

  codeHash: string;

  attempts: number;

  maxAttempts: number;

  expiresAt: Date;

  lastSentAt: Date;

  consumedAt?: Date;

  createdAt: Date;

  updatedAt: Date;
}

/* =========================================================
   SCHEMA
========================================================= */

const emailVerificationCodeSchema =
  new Schema<IEmailVerificationCode>(
    {
      emailLookup: {
        type: String,
        required: true,
        unique: true,
        index: true,
        trim: true,
      },

      codeHash: {
        type: String,
        required: true,
        select: false,
      },

      attempts: {
        type: Number,
        default: 0,
        min: 0,
      },

      maxAttempts: {
        type: Number,
        default: 5,
        min: 1,
        max: 10,
      },

      expiresAt: {
        type: Date,
        required: true,
        index: true,
      },

      lastSentAt: {
        type: Date,
        required: true,
      },

      consumedAt: {
        type: Date,
        default: undefined,
      },
    },

    {
      timestamps: true,
      versionKey: false,
      strict: true,
    }
  );

/* =========================================================
   TTL INDEX
========================================================= */

emailVerificationCodeSchema.index(
  {
    expiresAt: 1,
  },
  {
    expireAfterSeconds: 0,
  }
);

/* =========================================================
   MODEL
========================================================= */

/*
 * IMPORTANT:
 * During development Next/ts-node/hot reload can keep
 * an old Mongoose model in memory.
 */

const EmailVerificationCodeModel =
  (mongoose.models.EmailVerificationCode as Model<IEmailVerificationCode>) ||
  mongoose.model<IEmailVerificationCode>(
    "EmailVerificationCode",
    emailVerificationCodeSchema
  );

export const EmailVerificationCode =
  EmailVerificationCodeModel;

export default EmailVerificationCodeModel;