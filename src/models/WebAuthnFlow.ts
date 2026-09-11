import mongoose, { Schema, type Document, type Model } from "mongoose";

export type WebAuthnFlowKind =
  | "PASSKEY_REGISTRATION"
  | "PAYMENT_AUTHENTICATION"
  | "PAYMENT_AUTHORIZATION";

export interface IWebAuthnFlow extends Document {
  flowId: string;
  userId: mongoose.Types.ObjectId;
  kind: WebAuthnFlowKind;
  challenge?: string;
  operationHash?: string;
  tokenHash?: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const webAuthnFlowSchema = new Schema<IWebAuthnFlow>(
  {
    flowId: { type: String, required: true, unique: true, maxlength: 120 },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: {
      type: String,
      required: true,
      enum: [
        "PASSKEY_REGISTRATION",
        "PAYMENT_AUTHENTICATION",
        "PAYMENT_AUTHORIZATION",
      ],
      index: true,
    },
    challenge: { type: String, select: false, maxlength: 1024 },
    operationHash: { type: String, select: false, maxlength: 64 },
    tokenHash: { type: String, select: false, maxlength: 64 },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
    strict: "throw",
  }
);

webAuthnFlowSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
webAuthnFlowSchema.index(
  { tokenHash: 1 },
  {
    unique: true,
    partialFilterExpression: { kind: "PAYMENT_AUTHORIZATION" },
  }
);

const WebAuthnFlowModel: Model<IWebAuthnFlow> =
  (mongoose.models.WebAuthnFlow as Model<IWebAuthnFlow> | undefined) ??
  mongoose.model<IWebAuthnFlow>("WebAuthnFlow", webAuthnFlowSchema);

export const WebAuthnFlow = WebAuthnFlowModel;
export default WebAuthnFlowModel;
