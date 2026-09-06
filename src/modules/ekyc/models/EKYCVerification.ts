import mongoose, { Schema, type Document } from "mongoose";
import type { EKYCReasonCode, EKYCStatus, EncryptedField } from "../types.js";

export interface IEKYCVerification extends Document {
  userId: mongoose.Types.ObjectId;
  status: EKYCStatus;
  reasonCodes: EKYCReasonCode[];
  providerName?: string;
  providerReferenceEncrypted?: EncryptedField;
  nidLookupHash: string;
  nidEncrypted: EncryptedField;
  dateOfBirthEncrypted: EncryptedField;
  claimedNameEncrypted: EncryptedField;
  mediaRefsEncrypted: EncryptedField;
  correlationId: string;
  attemptId: string;
  faceScore?: number;
  nameScore?: number;
  livenessPassed?: boolean;
  possibleDuplicateVectorId?: string;
  submittedAt: Date;
  decidedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const encryptedFieldSchema = new Schema<EncryptedField>({
  encrypted: { type: String, required: true },
  iv: { type: String, required: true },
  authTag: { type: String, required: true },
  keyVersion: { type: String, required: true },
}, { _id: false });

const statusValues: EKYCStatus[] = [
  "QUEUED", "PROCESSING", "VERIFIED", "PENDING_MANUAL_REVIEW", "REJECTED",
];

const ekycVerificationSchema = new Schema<IEKYCVerification>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  status: { type: String, enum: statusValues, required: true, default: "QUEUED", index: true },
  reasonCodes: { type: [String], default: [] },
  providerName: { type: String, maxlength: 80 },
  providerReferenceEncrypted: { type: encryptedFieldSchema },
  nidLookupHash: { type: String, required: true, select: false },
  nidEncrypted: { type: encryptedFieldSchema, required: true, select: false },
  dateOfBirthEncrypted: { type: encryptedFieldSchema, required: true, select: false },
  claimedNameEncrypted: { type: encryptedFieldSchema, required: true, select: false },
  mediaRefsEncrypted: { type: encryptedFieldSchema, required: true, select: false },
  correlationId: { type: String, required: true, maxlength: 120, index: true },
  attemptId: { type: String, required: true, maxlength: 120, unique: true },
  faceScore: { type: Number, min: 0, max: 100 },
  nameScore: { type: Number, min: 0, max: 100 },
  livenessPassed: { type: Boolean },
  possibleDuplicateVectorId: { type: String, maxlength: 120 },
  submittedAt: { type: Date, required: true, default: Date.now },
  decidedAt: { type: Date },
}, {
  timestamps: true,
  versionKey: false,
  strict: "throw",
});

// Race-safe uniqueness: several pending attempts may exist, but only one account can
// transition to VERIFIED for a given deterministic HMAC of the normalized NID.
ekycVerificationSchema.index(
  { nidLookupHash: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "VERIFIED" },
    name: "uniq_verified_nid",
  }
);
ekycVerificationSchema.index(
  { userId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "VERIFIED" },
    name: "uniq_verified_user",
  }
);
ekycVerificationSchema.index({ status: 1, submittedAt: 1 });

export const EKYCVerification: mongoose.Model<IEKYCVerification> =
  (mongoose.models.EKYCVerification as mongoose.Model<IEKYCVerification> | undefined) ??
  mongoose.model<IEKYCVerification>("EKYCVerification", ekycVerificationSchema);

export default EKYCVerification;
