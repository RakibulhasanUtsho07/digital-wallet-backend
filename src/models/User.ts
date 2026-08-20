import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  phone: string;
  password?: string;
  role: "CUSTOMER" | "ADMIN";
  kycStatus: "PENDING" | "VERIFIED" | "REJECTED";
  walletId?: mongoose.Types.ObjectId;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["CUSTOMER", "ADMIN"], default: "CUSTOMER" },
    kycStatus: { type: String, enum: ["PENDING", "VERIFIED", "REJECTED"], default: "PENDING" },
    walletId: { type: Schema.Types.ObjectId, ref: "Wallet" },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>("User", userSchema);