import mongoose, {
  Schema,
  type Model,
  type Types,
} from "mongoose";

export type EKYCPhoneChallengeStatus =
  | "PENDING"
  | "VERIFIED"
  | "LOCKED"
  | "DELIVERY_FAILED"
  | "CONSUMED";

export type EKYCPhoneChallengeChannel =
  | "sms"
  | "whatsapp";

export interface EKYCPhoneChallengeRecord {
  _id: Types.ObjectId;
  userId: Types.ObjectId;

  phoneCiphertext: string;
  phoneIv: string;
  phoneAuthTag: string;
  phoneLookupHash: string;

  otpHash?: string;

  channel: EKYCPhoneChallengeChannel;
  status: EKYCPhoneChallengeStatus;

  attempts: number;
  maxAttempts: number;

  otpExpiresAt: Date;
  resendAvailableAt: Date;

  verifiedAt?: Date;
  verifiedUntil?: Date;
  consumedAt?: Date;

  provider: string;
  providerRequestId?: string;

  deleteAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

const ekycPhoneChallengeSchema =
  new Schema<EKYCPhoneChallengeRecord>(
    {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      phoneCiphertext: {
        type: String,
        required: true,
        select: false,
      },

      phoneIv: {
        type: String,
        required: true,
        select: false,
      },

      phoneAuthTag: {
        type: String,
        required: true,
        select: false,
      },

      phoneLookupHash: {
        type: String,
        required: true,
        index: true,
        select: false,
      },

      otpHash: {
        type: String,
        required: false,
        select: false,
      },

      channel: {
        type: String,
        enum: ["sms", "whatsapp"],
        default: "sms",
        required: true,
        index: true,
      },

      status: {
        type: String,
        enum: [
          "PENDING",
          "VERIFIED",
          "LOCKED",
          "DELIVERY_FAILED",
          "CONSUMED",
        ],
        default: "PENDING",
        required: true,
        index: true,
      },

      attempts: {
        type: Number,
        default: 0,
        min: 0,
        required: true,
      },

      maxAttempts: {
        type: Number,
        default: 5,
        min: 1,
        required: true,
      },

      otpExpiresAt: {
        type: Date,
        required: true,
        index: true,
      },

      resendAvailableAt: {
        type: Date,
        required: true,
      },

      verifiedAt: {
        type: Date,
        required: false,
      },

      verifiedUntil: {
        type: Date,
        required: false,
        index: true,
      },

      consumedAt: {
        type: Date,
        required: false,
      },

      provider: {
        type: String,
        required: true,
        trim: true,
      },

      providerRequestId: {
        type: String,
        required: false,
        trim: true,
      },

      deleteAt: {
        type: Date,
        required: true,
      },
    },
    {
      timestamps: true,
      versionKey: false,
      collection: "ekyc_phone_challenges",
    }
  );

ekycPhoneChallengeSchema.index({
  userId: 1,
  createdAt: -1,
});

ekycPhoneChallengeSchema.index({
  userId: 1,
  phoneLookupHash: 1,
  createdAt: -1,
});

ekycPhoneChallengeSchema.index(
  {
    deleteAt: 1,
  },
  {
    expireAfterSeconds: 0,
  }
);

export const EKYCPhoneChallenge =
  (mongoose.models
    .EKYCPhoneChallenge as Model<EKYCPhoneChallengeRecord> | undefined) ??
  mongoose.model<EKYCPhoneChallengeRecord>(
    "EKYCPhoneChallenge",
    ekycPhoneChallengeSchema
  );

export default EKYCPhoneChallenge;
