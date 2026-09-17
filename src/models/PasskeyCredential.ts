import mongoose, { Schema, type Document, type Model } from "mongoose";
import type {
  AuthenticatorTransportFuture,
  CredentialDeviceType,
} from "@simplewebauthn/server";

export interface IPasskeyCredential extends Document {
  userId: mongoose.Types.ObjectId;
  credentialId: string;
  publicKey: Buffer;
  counter: number;
  deviceType: CredentialDeviceType;
  backedUp: boolean;
  transports: AuthenticatorTransportFuture[];
  label: string;
  lastUsedAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const passkeyCredentialSchema = new Schema<IPasskeyCredential>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    credentialId: {
      type: String,
      required: true,
      unique: true,
      maxlength: 1024,
    },
    publicKey: {
      type: Buffer,
      required: true,
      select: false,
    },
    counter: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    deviceType: {
      type: String,
      enum: ["singleDevice", "multiDevice"],
      required: true,
    },
    backedUp: {
      type: Boolean,
      required: true,
      default: false,
    },
    transports: {
      type: [String],
      default: [],
    },
    label: {
      type: String,
      trim: true,
      minlength: 2,
      maxlength: 80,
      default: "This device",
    },
    lastUsedAt: Date,
    revokedAt: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    strict: "throw",
  }
);

passkeyCredentialSchema.index({ userId: 1, revokedAt: 1, createdAt: -1 });

const PasskeyCredentialModel: Model<IPasskeyCredential> =
  (mongoose.models.PasskeyCredential as Model<IPasskeyCredential> | undefined) ??
  mongoose.model<IPasskeyCredential>("PasskeyCredential", passkeyCredentialSchema);

export const PasskeyCredential = PasskeyCredentialModel;
export default PasskeyCredentialModel;
