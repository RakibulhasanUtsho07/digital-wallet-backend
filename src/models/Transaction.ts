import mongoose, { Schema, Document } from "mongoose";

export interface ITransaction extends Document {
  senderId: mongoose.Types.ObjectId;
  receiverId: mongoose.Types.ObjectId;
  amount: number;
  currency: string;
  type: "TRANSFER" | "DEPOSIT" | "WITHDRAW";
  status: "PENDING" | "COMPLETED" | "FAILED";
  reference?: string;
  riskScore: "LOW" | "MEDIUM" | "HIGH";
  createdAt?: Date;
  updatedAt?: Date;
}

const transactionSchema = new Schema<ITransaction>(
  {
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiverId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    currency: {
      type: String,
      default: "BDT",
    },
    type: {
      type: String,
      enum: ["TRANSFER", "DEPOSIT", "WITHDRAW"],
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "FAILED"],
      default: "PENDING",
    },
    reference: {
      type: String,
      trim: true,
    },
    riskScore: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"],
      default: "LOW",
    },
  },
  { timestamps: true }
);

export const Transaction = mongoose.model<ITransaction>("Transaction", transactionSchema);
export default Transaction;