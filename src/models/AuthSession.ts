import mongoose, {
  Document,
  Schema,
} from "mongoose";

export interface IAuthSession
  extends Document {
  userId: mongoose.Types.ObjectId;
  sessionId: string;

  device: string;
  browser: string;
  os: string;
  location: string;
  maskedIp: string;
  ipHash: string;
  userAgentHash: string;

  lastActiveAt: Date;
  expiresAt: Date;
  revokedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const authSessionSchema =
  new Schema<IAuthSession>(
    {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      sessionId: {
        type: String,
        required: true,
        unique: true,
        index: true,
      },

      device: {
        type: String,
        required: true,
        maxlength: 120,
      },
      browser: {
        type: String,
        required: true,
        maxlength: 80,
      },
      os: {
        type: String,
        required: true,
        maxlength: 80,
      },
      location: {
        type: String,
        required: true,
        maxlength: 140,
      },
      maskedIp: {
        type: String,
        required: true,
        maxlength: 120,
      },
      ipHash: {
        type: String,
        required: true,
        maxlength: 128,
      },
      userAgentHash: {
        type: String,
        required: true,
        maxlength: 128,
      },

      lastActiveAt: {
        type: Date,
        required: true,
        default: Date.now,
        index: true,
      },
      expiresAt: {
        type: Date,
        required: true,
        index: true,
      },
      revokedAt: {
        type: Date,
        index: true,
      },
    },
    {
      timestamps: true,
      versionKey: false,
    }
  );

authSessionSchema.index({
  userId: 1,
  revokedAt: 1,
  expiresAt: -1,
});

/* Remove expired sessions automatically. */
authSessionSchema.index(
  {
    expiresAt: 1,
  },
  {
    expireAfterSeconds: 0,
  }
);

export const AuthSession =
  mongoose.models.AuthSession ||
  mongoose.model<IAuthSession>(
    "AuthSession",
    authSessionSchema
  );

export default AuthSession;
