import type { NextFunction, Request, Response } from "express";
import { resolveAiActorContext } from "../context/aiActorContextService.js";
import { CofferAiError } from "../errors/cofferAiError.js";
import {
  getRoleFeedbackInsights, listRoleKnowledge, reviewRoleKnowledge, submitRoleKnowledge,
} from "../learning/aiKnowledgeLearningService.js";
import { requiredAiRouteParam } from "./aiRouteParams.js";
import type { AiTrustedRequestSource } from "../types/cofferAi.types.js";

function staffActor(req: Request) {
  const source = req as Request & { user?: AiTrustedRequestSource["user"] };
  const actor = resolveAiActorContext({ user: source.user ?? null }, `learning-${Date.now()}`);
  if (!actor.userId || !["support", "analyst", "admin", "super_admin"].includes(actor.actorType)) {
    throw new CofferAiError({ code: "AI_LEARNING_SCOPE_REQUIRED", message: "Staff access is required.", statusCode: 403 });
  }
  return { ...actor, userId: actor.userId };
}

function adminActor(req: Request) {
  const actor = staffActor(req);
  if (actor.actorType !== "admin" && actor.actorType !== "super_admin") {
    throw new CofferAiError({ code: "AI_LEARNING_ADMIN_REQUIRED", message: "Administrator review is required.", statusCode: 403 });
  }
  return actor;
}

export async function submitAiRoleKnowledgeController(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = staffActor(req);
    const body = req.body ?? {};
    const article = await submitRoleKnowledge({
      actorType: actor.actorType,
      userId: actor.userId,
      audienceRole: body.audienceRole,
      intent: body.intent,
      title: body.title,
      summary: body.summary,
      content: body.content,
      sourceReference: body.sourceReference,
    });
    res.status(201).json({ success: true, data: article, meta: { awaitingHumanReview: true, usedByAssistant: false } });
  } catch (error) { next(error); }
}

export async function listAiRoleKnowledgeController(req: Request, res: Response, next: NextFunction) {
  try {
    adminActor(req);
    const articles = await listRoleKnowledge({
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      audienceRole: typeof req.query.audienceRole === "string" ? req.query.audienceRole : undefined,
    });
    res.json({ success: true, data: { articles } });
  } catch (error) { next(error); }
}

export async function reviewAiRoleKnowledgeController(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = adminActor(req);
    const action = req.body?.action;
    if (action !== "approve" && action !== "reject" && action !== "retire") {
      throw new CofferAiError({ code: "AI_LEARNING_INVALID", message: "action must be approve, reject or retire.", statusCode: 400 });
    }
    const article = await reviewRoleKnowledge({
      id: requiredAiRouteParam(req, "articleId"),
      adminId: actor.userId,
      action,
      note: typeof req.body?.note === "string" ? req.body.note : undefined,
    });
    res.json({ success: true, data: article, meta: { humanReviewed: true, financialMutation: false } });
  } catch (error) { next(error); }
}

export async function aiFeedbackInsightsController(req: Request, res: Response, next: NextFunction) {
  try {
    adminActor(req);
    const insights = await getRoleFeedbackInsights();
    res.json({ success: true, data: { insights }, meta: { aggregateOnly: true, feedbackIsNotKnowledge: true } });
  } catch (error) { next(error); }
}
