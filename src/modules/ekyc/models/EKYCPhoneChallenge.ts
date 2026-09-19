import mongoose, {
  Schema,
  type Document,
} from "mongoose";

import type {
  IEncryptedData,
} from "../../../models/User.js";

export type EKYCPhoneOtpProvider =
  | "descope"
  | "development";

export interface IEKYCPhoneChallenge extends Document {
  userId: mongoose.Types.ObjectId;
  phoneEncrypted: IEncryptedData;
  phoneLookup: string;
  provider: EKYCPhoneOtpProvider;
  otpHash?: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
  verifiedAt?: Date;
  consumedAt?: Date;
  lastSentAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const encryptedSchema =
  new Schema<IEncryptedData>(
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

const phoneChallengeSchema =
  new Schema<IEKYCPhoneChallenge>(
    {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      phoneEncrypted: {
        type: encryptedSchema,
        required: true,
        select: false,
      },

      phoneLookup: {
        type: String,
        required: true,
        select: false,
      },

      provider: {
        type: String,
        enum: [
          "descope",
          "development",
        ],
        required: true,
        default: "descope",
      },

      otpHash: {
        type: String,
        required: false,
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
        index: true,
      },

      verifiedAt: {
        type: Date,
      },

      consumedAt: {
        type: Date,
      },

      lastSentAt: {
        type: Date,
        required: true,
        default: Date.now,
      },
    },
    {
      timestamps: true,
      versionKey: false,
      strict: "throw",
    }
  );

phoneChallengeSchema.index(
  {
    expiresAt: 1,
  },
  {
    expireAfterSeconds:
      24 * 60 * 60,
  }
);

phoneChallengeSchema.index({
  userId: 1,
  createdAt: -1,
});

const EKYCPhoneChallengeModel =
  (mongoose.models
    .EKYCPhoneChallenge as
    | mongoose.Model<IEKYCPhoneChallenge>
    | undefined) ??
  mongoose.model<IEKYCPhoneChallenge>(
    "EKYCPhoneChallenge",
    phoneChallengeSchema
  );

/*
 * Both named and default exports are provided so existing
 * imports remain compatible.
 */
export {
  EKYCPhoneChallengeModel as EKYCPhoneChallenge,
};

export default EKYCPhoneChallengeModel;