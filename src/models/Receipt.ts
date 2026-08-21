import mongoose, { Schema, Document } from "mongoose";

export interface IReceipt extends Document {
  userId: mongoose.Types.ObjectId;
  merchantName: string;
  amount: number;
  category: string;
  receiptDate: Date;
  imageUrl?: string;
  isAiParsed: boolean; // ডায়াগ্রামের AI OCR ফিচারের জন্য
}

const receiptSchema = new Schema<IReceipt>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    merchantName: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    category: { type: String, required: true, default: "Uncategorized" },
    receiptDate: { type: Date, default: Date.now },
    imageUrl: { type: String }, // ক্লাউড স্টোরেজে থাকা ছবির লিংক
    isAiParsed: { type: Boolean, default: false }, // AI দিয়ে স্ক্যান করা হলে true হবে
  },
  { timestamps: true }
);

export const Receipt = mongoose.model<IReceipt>("Receipt", receiptSchema);
export default Receipt;