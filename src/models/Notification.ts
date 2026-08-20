import mongoose, { Schema, Document } from "mongoose";

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  message: string;
  type: "TRANSFER" | "DEPOSIT" | "WITHDRAW" | "KYC" | "SYSTEM";
  isRead: boolean;
  createdAt?: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: ["TRANSFER", "DEPOSIT", "WITHDRAW", "KYC", "SYSTEM"],
      default: "SYSTEM",
    },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Notification = mongoose.model<INotification>("Notification", notificationSchema);
export default Notification;