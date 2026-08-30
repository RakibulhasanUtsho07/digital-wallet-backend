import mongoose, {
  Document,
  Schema,
} from "mongoose";

import type {
  TwoFactorMethod,
} from "./SecurityPreferences.js";

export interface ITwoFactorChallenge
  extends Document {
  challengeId: string;
  userId: mongoose.Types.ObjectId;
  purpose: "login";
  method: TwoFactorMethod;
  codeHash?: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
  consumedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const twoFactorChallengeSchema =
  new Schema<ITwoFactorChallenge>(
    {
      challengeId: {
        type: String,
        required: true,
        unique: true,
        index: true,
      },

      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      purpose: {
        type: String,
        enum: ["login"],
        default: "login",
        required: true,
      },

      method: {
        type: String,
        enum: [
          "app",
          "email",
          "sms",
        ],
        required: true,
      },

      codeHash: {
        type: String,
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

      consumedAt: {
        type: Date,
      },
    },
    {
      timestamps: true,
      versionKey: false,
    }
  );

twoFactorChallengeSchema.index(
  {
    expiresAt: 1,
  },
  {
    expireAfterSeconds: 0,
  }
);

export const TwoFactorChallenge =
  mongoose.models.TwoFactorChallenge ||
  mongoose.model<ITwoFactorChallenge>(
    "TwoFactorChallenge",
    twoFactorChallengeSchema
  );

export default TwoFactorChallenge;
