import mongoose, {
  type Document,
  type Model,
  Schema,
} from "mongoose";

export interface IPasswordResetChallenge extends Document {
  userId: mongoose.Types.ObjectId;
  emailLookup: string;
  otpHash: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
  lastSentAt: Date;
  verifiedAt?: Date;
  resetTokenHash?: string;
  resetTokenExpiresAt?: Date;
  consumedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const passwordResetChallengeSchema =
  new Schema<IPasswordResetChallenge>(
    {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true,
      },

      emailLookup: {
        type: String,
        required: true,
        index: true,
        select: false,
      },

      otpHash: {
        type: String,
        required: true,
        select: false,
      },

      attempts: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
      },

      maxAttempts: {
        type: Number,
        required: true,
        default: 5,
        min: 1,
        max: 10,
      },

      expiresAt: {
        type: Date,
        required: true,
      },

      lastSentAt: {
        type: Date,
        required: true,
        default: Date.now,
      },

      verifiedAt: {
        type: Date,
        default: undefined,
      },

      resetTokenHash: {
        type: String,
        select: false,
        default: undefined,
      },

      resetTokenExpiresAt: {
        type: Date,
        default: undefined,
      },

      consumedAt: {
        type: Date,
        default: undefined,
      },
    },
    {
      timestamps: true,
      versionKey: false,
      strict: "throw",
    }
  );

/* MongoDB removes expired challenges automatically. */
passwordResetChallengeSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

passwordResetChallengeSchema.index({
  emailLookup: 1,
  createdAt: -1,
});

export const PasswordResetChallenge: Model<IPasswordResetChallenge> =
  (mongoose.models.PasswordResetChallenge as
    | Model<IPasswordResetChallenge>
    | undefined) ??
  mongoose.model<IPasswordResetChallenge>(
    "PasswordResetChallenge",
    passwordResetChallengeSchema
  );

export default PasswordResetChallenge;
