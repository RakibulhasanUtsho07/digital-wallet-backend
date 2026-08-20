import mongoose, { Schema, Document } from "mongoose";

export interface IKYC extends Document {
  userId: mongoose.Types.ObjectId;
  documentType: "NID" | "PASSPORT" | "DRIVING_LICENSE";
  documentNumber: string;
  documentUrl?: string;
  status: "PENDING" | "VERIFIED" | "REJECTED";
  rejectionReason?: string;
  reviewedBy?: mongoose.Types.ObjectId;
}

const kycSchema = new Schema<IKYC>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    documentType: {
      type: String,
      enum: ["NID", "PASSPORT", "DRIVING_LICENSE"],
      required: true,
    },
    documentNumber: { type: String, required: true, trim: true },
    documentUrl: { type: String, default: "" },
    status: {
      type: String,
      enum: ["PENDING", "VERIFIED", "REJECTED"],
      default: "PENDING",
    },
    rejectionReason: { type: String, default: "" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const KYC = mongoose.model<IKYC>("KYC", kycSchema);
export default KYC;