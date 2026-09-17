import mongoose, { Document, Model, Schema } from "mongoose";

export interface IAnalystSavedView extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  route: string;
  filters: Record<string, unknown>;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IAnalystSavedView>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  route: {
    type: String, required: true, trim: true, maxlength: 220,
    validate: { validator: (value: string) => value.startsWith("/dashboard/analyst"), message: "Saved view route must belong to the analyst workspace." },
  },
  filters: { type: Schema.Types.Mixed, default: {} },
  isDefault: { type: Boolean, default: false, index: true },
}, { timestamps: true, versionKey: false, strict: "throw", minimize: false });

schema.index({ userId: 1, name: 1 }, { unique: true, name: "unique_analyst_saved_view_name" });
schema.index({ userId: 1, updatedAt: -1 });

const ModelRef: Model<IAnalystSavedView> =
  (mongoose.models.AnalystSavedView as Model<IAnalystSavedView>) ||
  mongoose.model<IAnalystSavedView>("AnalystSavedView", schema);

export const AnalystSavedView = ModelRef;
export default ModelRef;
