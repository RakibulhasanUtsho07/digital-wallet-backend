import { requiredAiRouteParam } from "./aiRouteParams.js";
import type {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  resolveAiActorContext,
} from "../context/aiActorContextService.js";
import {
  CofferAiError,
} from "../errors/cofferAiError.js";
import {
  getSupportCaseOutcome,
  recordSupportCaseOutcome,
  reopenSupportCase,
} from "../services/supportResolutionOutcomeService.js";
import {
  getSupportPlaybookEffectiveness,
  getSupportResolutionQuality,
} from "../services/supportResolutionQualityService.js";
import type {
  AiTrustedRequestSource,
} from "../types/cofferAi.types.js";

function requestSource(
  req: Request,
): AiTrustedRequestSource {
  const request =
    req as Request & {
      user?: unknown;
      merchant?: unknown;
    };

  return {
    user:
      (
        request.user ??
        null
      ) as AiTrustedRequestSource["user"],

    merchant:
      (
        request.merchant ??
        null
      ) as AiTrustedRequestSource["merchant"],
  };
}

function requireSupport(
  req: Request,
) {
  const actor =
    resolveAiActorContext(
      requestSource(
        req,
      ),
      `support-quality-${Date.now()}`,
    );

  if (
    !actor.isAuthenticated ||
    actor.actorType !==
      "support" ||
    !actor.userId
  ) {
    throw new CofferAiError({
      code:
        "AI_SUPPORT_SCOPE_REQUIRED",
      message:
        "Support resolution-quality features are available only to Support Agent accounts.",
      statusCode:
        403,
    });
  }

  return { ...actor, userId: actor.userId };
}

export async function getSupportCaseOutcomeController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    requireSupport(
      req,
    );

    const outcome =
      await getSupportCaseOutcome(
        requiredAiRouteParam(req, "caseId"),
      );

    res.json({
      success:
        true,
      data: {
        outcome,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function recordSupportCaseOutcomeController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const actor =
      requireSupport(
        req,
      );

    const result =
      await recordSupportCaseOutcome({
        caseId:
          requiredAiRouteParam(req, "caseId"),
        supportUserId:
          actor.userId,
        status:
          typeof req.body?.status ===
            "string"
            ? req.body.status
            : "",
        resolutionSource:
          typeof req.body?.resolutionSource ===
            "string"
            ? req.body.resolutionSource
            : "",
        resolutionCode:
          typeof req.body?.resolutionCode ===
            "string"
            ? req.body.resolutionCode
            : "",
        playbookRunId:
          typeof req.body?.playbookRunId ===
            "string"
            ? req.body.playbookRunId
            : null,
        customerConfirmedResolved:
          typeof req.body?.customerConfirmedResolved ===
            "boolean"
            ? req.body.customerConfirmedResolved
            : null,
        escalationTeam:
          typeof req.body?.escalationTeam ===
            "string"
            ? req.body.escalationTeam
            : null,
        duplicateOfCaseId:
          typeof req.body?.duplicateOfCaseId ===
            "string"
            ? req.body.duplicateOfCaseId
            : null,
        resolutionNote:
          typeof req.body?.resolutionNote ===
            "string"
            ? req.body.resolutionNote
            : null,
        agentConfirmed:
          req.body?.agentConfirmed ===
          true,
      });

    res.status(201).json({
      success:
        true,
      data:
        result,
      meta: {
        humanConfirmed:
          true,
        financialMutation:
          false,
        automaticResolution:
          false,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function reopenSupportCaseController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const actor =
      requireSupport(
        req,
      );

    const result =
      await reopenSupportCase({
        caseId:
          requiredAiRouteParam(req, "caseId"),
        supportUserId:
          actor.userId,
        reason:
          typeof req.body?.reason ===
            "string"
            ? req.body.reason
            : "",
        agentConfirmed:
          req.body?.agentConfirmed ===
          true,
      });

    res.json({
      success:
        true,
      data:
        result,
      meta: {
        humanConfirmed:
          true,
        financialMutation:
          false,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getSupportResolutionQualityController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    requireSupport(
      req,
    );

    const result =
      await getSupportResolutionQuality({
        range:
          typeof req.query.range ===
            "string"
            ? req.query.range
            : undefined,
      });

    res.json({
      success:
        true,
      data:
        result,
      meta: {
        descriptiveAnalytics:
          true,
        agentRanking:
          false,
        aiProviderRequired:
          false,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getSupportPlaybookEffectivenessController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    requireSupport(
      req,
    );

    const result =
      await getSupportPlaybookEffectiveness({
        range:
          typeof req.query.range ===
            "string"
            ? req.query.range
            : undefined,
      });

    res.json({
      success:
        true,
      data:
        result,
      meta: {
        descriptiveAnalytics:
          true,
        compositeScore:
          false,
        aiProviderRequired:
          false,
      },
    });
  } catch (error) {
    next(error);
  }
}
