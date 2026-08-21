import mongoose, { Schema, Document } from "mongoose";

export interface IBudget extends Document {
  userId: mongoose.Types.ObjectId;
  category: string;
  limitAmount: number;
  spentAmount: number;
  month: number;
  year: number;
}

const budgetSchema = new Schema<IBudget>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    category: { type: String, required: true, trim: true },
    limitAmount: { type: Number, required: true, min: 0 },
    spentAmount: { type: Number, default: 0, min: 0 },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
  },
  { timestamps: true }
);

// Ensure a user can only have one budget per category per month/year
budgetSchema.index({ userId: 1, category: 1, month: 1, year: 1 }, { unique: true });

export const Budget = mongoose.model<IBudget>("Budget", budgetSchema);
export default Budget;