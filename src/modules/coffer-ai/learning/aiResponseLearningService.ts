import mongoose from "mongoose";
import { AiFeedback } from "../../../models/AiFeedback.js";
import type { AiActorType } from "../types/cofferAi.types.js";

export type AiResponseStyle = "balanced" | "concise" | "detailed";
export type AiFeedbackReason = "too_long" | "too_short" | "unclear" | "incorrect" | "irrelevant" | "other";

// Feedback can change presentation only. It never changes an intent, permission,
// evidence source, model, or the published knowledge base.
export function chooseAiResponseStyle(
  message: string,
  reasons: ReadonlyArray<AiFeedbackReason>,
): AiResponseStyle {
  if (/\b(?:brief(?:ly)?|short(?:er)?|concise|tl;dr)\b|সংক্ষেপে|সংক্ষিপ্ত|ছোট করে|শর্ট করে/i.test(message)) {
    return "concise";
  }
  if (/\b(?:detailed|more detail|step by step|elaborate)\b|বিস্তারিত|ধাপে ধাপে/i.test(message)) {
    return "detailed";
  }

  const long = reasons.filter((reason) => reason === "too_long").length;
  const short = reasons.filter((reason) => reason === "too_short").length;
  if (long >= 2 && long > short) return "concise";
  if (short >= 2 && short > long) return "detailed";
  return "balanced";
}

export async function responseStyleForActor(input: {
  ownerId: string;
  actorType: AiActorType;
  message: string;
}): Promise<AiResponseStyle> {
  const explicit = chooseAiResponseStyle(input.message, []);
  if (explicit !== "balanced" || input.actorType === "guest" ||
      !mongoose.isValidObjectId(input.ownerId)) return explicit;

  try {
    const rows = await AiFeedback.find({
      ownerId: new mongoose.Types.ObjectId(input.ownerId),
      actorType: input.actorType,
      rating: "not_helpful",
      reason: { $in: ["too_long", "too_short"] },
      updatedAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
    }).select("reason").sort({ updatedAt: -1 }).limit(20).lean();
    return chooseAiResponseStyle(input.message, rows.map((row) => row.reason as AiFeedbackReason));
  } catch {
    // An unavailable feedback store must not prevent an evidence-bound answer.
    return "balanced";
  }
}
