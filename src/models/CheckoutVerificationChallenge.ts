import mongoose, {
  Document,
  Model,
  Schema,
} from "mongoose";

export type CheckoutVerificationChannel =
  | "email"
  | "sms";

export type CheckoutVerificationMode =
  | "test"
  | "live";

export interface ICheckoutVerificationChallenge
  extends Document {
  challengeId: string;

  paymentId: string;

  mode:
    CheckoutVerificationMode;

  userId?:
    mongoose.Types.ObjectId;

  channel:
    CheckoutVerificationChannel;

  identifierLookup:
    string;

  codeHash:
    string;

  attempts:
    number;

  maxAttempts:
    number;

  expiresAt:
    Date;

  lastSentAt:
    Date;

  consumedAt?:
    Date;

  createdAt:
    Date;

  updatedAt:
    Date;
}

const checkoutVerificationChallengeSchema =
  new Schema<ICheckoutVerificationChallenge>(
    {
      challengeId: {
        type: String,
        required: true,
        unique: true,
        index: true,
        immutable: true,
      },

      paymentId: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },

      mode: {
        type: String,
        enum: [
          "test",
          "live",
        ],
        required: true,
        index: true,
      },

      userId: {
        type:
          Schema.Types.ObjectId,

        ref:
          "User",

        default:
          undefined,

        index:
          true,
      },

      channel: {
        type: String,
        enum: [
          "email",
          "sms",
        ],
        required: true,
      },

      identifierLookup: {
        type: String,
        required: true,
        trim: true,
        index: true,
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

checkoutVerificationChallengeSchema.index(
  {
    expiresAt: 1,
  },
  {
    expireAfterSeconds: 0,
    name:
      "checkout_verification_expiry",
  }
);

checkoutVerificationChallengeSchema.index(
  {
    paymentId: 1,
    identifierLookup: 1,
    createdAt: -1,
  },
  {
    name:
      "checkout_verification_lookup",
  }
);

const CheckoutVerificationChallengeModel:
  Model<ICheckoutVerificationChallenge> =
    (
      mongoose.models
        .CheckoutVerificationChallenge as
        Model<ICheckoutVerificationChallenge>
    ) ||
    mongoose.model<ICheckoutVerificationChallenge>(
      "CheckoutVerificationChallenge",
      checkoutVerificationChallengeSchema
    );

export const CheckoutVerificationChallenge =
  CheckoutVerificationChallengeModel;

export default
CheckoutVerificationChallengeModel;