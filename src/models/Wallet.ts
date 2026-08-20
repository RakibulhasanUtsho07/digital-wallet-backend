import mongoose, { Schema, Document } from "mongoose";

export interface IWallet extends Document {
  userId: mongoose.Types.ObjectId;
  balance: number;
  pendingBalance: number;
  currency: string;
  status: "ACTIVE" | "FROZEN" | "BLOCKED";
}

const walletSchema = new Schema<IWallet>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    balance: { type: Number, required: true, default: 0.0, min: 0 },
    pendingBalance: { type: Number, default: 0.0 },
    currency: { type: String, default: "BDT" },
    status: { type: String, enum: ["ACTIVE", "FROZEN", "BLOCKED"], default: "ACTIVE" },
  },
  { timestamps: true }
);

export const Wallet = mongoose.model<IWallet>("Wallet", walletSchema);