import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role: "user" | "admin";
  kycStatus: "not_started" | "pending" | "verified" | "rejected";
  walletId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    kycStatus: {
      type: String,
      enum: [
        "not_started",
        "pending",
        "verified",
        "rejected",
      ],
      default: "not_started",
    },

    walletId: {
      type: Schema.Types.ObjectId,
      ref: "Wallet",
    },
  },
  {
    timestamps: true,
  }
);

/*
 * Prevent OverwriteModelError during development
 */
export const User =
  mongoose.models.User ||
  mongoose.model<IUser>("User", userSchema);