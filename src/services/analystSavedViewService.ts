import mongoose from "mongoose";
import { AnalystSavedView } from "../models/AnalystSavedView.js";

function name(v: unknown) {
  if (typeof v !== "string") throw new Error("Saved view name is required.");
  const out = v.trim();
  if (out.length < 2 || out.length > 100) throw new Error("Saved view name must be between 2 and 100 characters.");
  return out;
}
function route(v: unknown) {
  if (typeof v !== "string") throw new Error("Saved view route is required.");
  const out = v.trim();
  if (!out.startsWith("/dashboard/analyst")) throw new Error("Saved view route must belong to the analyst workspace.");
  return out.slice(0, 220);
}
function filters(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
}
async function clearDefault(userId: string, exceptId?: string) {
  const q: Record<string, unknown> = { userId, isDefault: true };
  if (exceptId && mongoose.Types.ObjectId.isValid(exceptId)) q._id = { $ne: exceptId };
  await AnalystSavedView.updateMany(q, { $set: { isDefault: false } });
}

export const listAnalystSavedViews = (userId: string) => AnalystSavedView.find({ userId }).sort({ isDefault: -1, updatedAt: -1 }).lean();

export async function createAnalystSavedView(input: { userId: string; name: unknown; route: unknown; filters: unknown; isDefault: unknown }) {
  const isDefault = input.isDefault === true;
  if (isDefault) await clearDefault(input.userId);
  return AnalystSavedView.create({ userId: input.userId, name: name(input.name), route: route(input.route), filters: filters(input.filters), isDefault });
}

export async function updateAnalystSavedView(input: { userId: string; id: string; name?: unknown; route?: unknown; filters?: unknown; isDefault?: unknown }) {
  if (!mongoose.Types.ObjectId.isValid(input.id)) return null;
  const update: Record<string, unknown> = {};
  if (input.name !== undefined) update.name = name(input.name);
  if (input.route !== undefined) update.route = route(input.route);
  if (input.filters !== undefined) update.filters = filters(input.filters);
  if (input.isDefault !== undefined) {
    update.isDefault = input.isDefault === true;
    if (update.isDefault) await clearDefault(input.userId, input.id);
  }
  return AnalystSavedView.findOneAndUpdate({ _id: input.id, userId: input.userId }, { $set: update }, { new: true, runValidators: true });
}

export async function deleteAnalystSavedView(input: { userId: string; id: string }) {
  if (!mongoose.Types.ObjectId.isValid(input.id)) return null;
  return AnalystSavedView.findOneAndDelete({ _id: input.id, userId: input.userId });
}
