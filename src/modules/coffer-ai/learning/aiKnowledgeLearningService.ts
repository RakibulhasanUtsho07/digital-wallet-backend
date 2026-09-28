import mongoose from "mongoose";
import { AiFeedback } from "../../../models/AiFeedback.js";
import { AiRoleKnowledge, type AiKnowledgeAudience, type AiRoleKnowledgeStatus } from "../../../models/AiRoleKnowledge.js";
import { CofferAiError } from "../errors/cofferAiError.js";
import { sanitizeAiText } from "../privacy/aiPrivacySanitizer.js";
import type { AiActorType, AiIntent } from "../types/cofferAi.types.js";

const allowedIntents: Record<AiKnowledgeAudience, ReadonlyArray<AiIntent>> = {
  user: ["payment_diagnosis", "wallet_summary", "kyc_status", "transaction_lookup", "transfer_diagnosis", "receipt_lookup", "security_summary"],
  merchant: ["merchant_payment_diagnosis", "merchant_overview", "merchant_refund_summary", "merchant_payout_summary", "merchant_settlement_summary", "merchant_webhook_summary", "merchant_api_key_summary", "merchant_analytics_summary", "merchant_refund_diagnosis", "merchant_payout_diagnosis", "merchant_settlement_diagnosis", "merchant_webhook_diagnosis", "merchant_api_key_diagnosis"],
  support: ["support_investigation", "support_operations_summary"],
  analyst: ["analyst_wallet_snapshot", "analyst_payment_snapshot", "analyst_risk_snapshot", "analyst_revenue_snapshot"],
  admin: ["admin_platform_overview", "admin_risk_snapshot", "admin_finance_snapshot"],
};

export function knowledgeAudienceForActor(actorType: AiActorType): AiKnowledgeAudience | null {
  if (actorType === "super_admin") return "admin";
  if (actorType === "guest") return null;
  return actorType;
}

export function knowledgeMatchesRoleAndIntent(input: {
  audienceRole: AiKnowledgeAudience;
  intent: string;
  actorType: AiActorType;
  requestedIntent: AiIntent;
}): boolean {
  return knowledgeAudienceForActor(input.actorType) === input.audienceRole &&
    input.intent === input.requestedIntent &&
    allowedIntents[input.audienceRole].includes(input.requestedIntent);
}

function invalid(message: string): never {
  throw new CofferAiError({ code: "AI_LEARNING_INVALID", message, statusCode: 400 });
}

function cleanField(value: unknown, name: string, max: number, min = 3): string {
  if (typeof value !== "string") return invalid(`${name} must be text.`);
  const text = value.trim();
  if (text.length < min || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) {
    return invalid(`${name} must contain ${min} to ${max} safe characters.`);
  }
  if (sanitizeAiText(text).detections.length > 0) return invalid(`${name} contains sensitive credentials.`);
  return text;
}

function objectId(id: string): mongoose.Types.ObjectId {
  if (!mongoose.isValidObjectId(id)) return invalid("Authenticated user ID is invalid.");
  return new mongoose.Types.ObjectId(id);
}

export async function submitRoleKnowledge(input: {
  actorType: AiActorType;
  userId: string;
  audienceRole: unknown;
  intent: unknown;
  title: unknown;
  summary: unknown;
  content: unknown;
  sourceReference: unknown;
}) {
  const role = input.audienceRole;
  if (typeof role !== "string" || !(role in allowedIntents)) return invalid("audienceRole is invalid.");
  const audienceRole = role as AiKnowledgeAudience;
  if (input.actorType !== "admin" && input.actorType !== "super_admin" &&
      !(input.actorType === "support" && audienceRole === "support") &&
      !(input.actorType === "analyst" && audienceRole === "analyst")) {
    throw new CofferAiError({ code: "AI_LEARNING_SCOPE_REQUIRED", message: "Only staff may submit guidance for their authorized role.", statusCode: 403 });
  }
  if (typeof input.intent !== "string" || !allowedIntents[audienceRole].includes(input.intent as AiIntent)) {
    return invalid("intent is not available for the selected audience.");
  }
  const title = cleanField(input.title, "title", 160);
  const summary = cleanField(input.summary, "summary", 400);
  const content = cleanField(input.content, "content", 2400);
  const sourceReference = cleanField(input.sourceReference, "sourceReference", 180);
  if (/ignore (?:all |previous )?instructions|(?:system|developer) prompt|override (?:the )?policy/i.test(`${title} ${summary} ${content}`)) {
    return invalid("Guidance must describe verified procedures, not AI instructions.");
  }
  const row = await AiRoleKnowledge.create({
    audienceRole, intent: input.intent, title, summary, content, sourceReference,
    status: "submitted", submittedByUserId: objectId(input.userId),
  });
  return { id: String(row._id), status: row.status, audienceRole, intent: row.intent };
}

export async function listRoleKnowledge(input: { status?: string; audienceRole?: string }) {
  if (input.status && !["submitted", "published", "rejected", "retired"].includes(input.status)) return invalid("status is invalid.");
  if (input.audienceRole && !(input.audienceRole in allowedIntents)) return invalid("audienceRole is invalid.");
  const filter: { status?: AiRoleKnowledgeStatus; audienceRole?: AiKnowledgeAudience } = {};
  if (input.status) filter.status = input.status as AiRoleKnowledgeStatus;
  if (input.audienceRole) filter.audienceRole = input.audienceRole as AiKnowledgeAudience;
  return AiRoleKnowledge.find(filter).sort({ updatedAt: -1 }).limit(100).lean();
}

export async function reviewRoleKnowledge(input: {
  id: string;
  adminId: string;
  action: "approve" | "reject" | "retire";
  note?: string;
}) {
  if (!mongoose.isValidObjectId(input.id)) return invalid("articleId is invalid.");
  const note = input.note === undefined ? undefined : cleanField(input.note, "note", 500, 1);
  if (input.action === "reject" && !note) return invalid("A review note is required for rejection.");
  const expected = input.action === "retire" ? "published" : "submitted";
  const status: AiRoleKnowledgeStatus = input.action === "approve" ? "published" : input.action === "reject" ? "rejected" : "retired";
  const row = await AiRoleKnowledge.findOneAndUpdate(
    { _id: new mongoose.Types.ObjectId(input.id), status: expected },
    { $set: { status, reviewedByUserId: objectId(input.adminId), reviewedAt: new Date(), reviewNote: note ?? "" } },
    { new: true },
  );
  if (!row) throw new CofferAiError({ code: "AI_LEARNING_STATE_CONFLICT", message: "Article not found or its review status changed.", statusCode: 409 });
  return { id: String(row._id), status: row.status, audienceRole: row.audienceRole, intent: row.intent };
}

// Aggregate only. Free-text comments and individual messages never feed a model or leave this queue.
export async function getRoleFeedbackInsights() {
  const rows = await AiFeedback.aggregate<{
    _id: { actorType: string; intent: string; reason: string };
    count: number;
  }>([
    { $match: { rating: "not_helpful", actorType: { $in: ["user", "merchant", "support", "analyst", "admin", "super_admin"] }, reason: { $in: ["too_long", "too_short", "unclear", "incorrect", "irrelevant", "other"] }, updatedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
    { $group: { _id: { actorType: "$actorType", intent: "$intent", reason: "$reason" }, count: { $sum: 1 } } },
    { $match: { count: { $gte: 3 } } },
    { $sort: { count: -1 } },
    { $limit: 60 },
  ]);
  return rows.map((row) => ({ role: row._id.actorType, intent: row._id.intent, reason: row._id.reason, count: row.count }));
}
