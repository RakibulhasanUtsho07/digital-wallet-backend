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
  completePlaybookRun,
  getPlaybookCatalog,
  getPlaybookDefinition,
  getPlaybookRun,
  recommendPlaybooksForCase,
  startPlaybookForCase,
  updatePlaybookStep,
} from "../services/supportGuidedResolutionService.js";
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
      `support-playbook-${Date.now()}`,
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
        "Support guided-resolution playbooks are available only to Support Agent accounts.",
      statusCode:
        403,
    });
  }

  return { ...actor, userId: actor.userId };
}

export async function listSupportPlaybooksController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    requireSupport(
      req,
    );

    res.json({
      success:
        true,
      data: {
        playbooks:
          getPlaybookCatalog(),
      },
      meta: {
        readOnly:
          true,
        financialMutation:
          false,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getSupportPlaybookController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    requireSupport(
      req,
    );

    res.json({
      success:
        true,
      data:
        getPlaybookDefinition(
          requiredAiRouteParam(req, "playbookId"),
        ),
    });
  } catch (error) {
    next(error);
  }
}

export async function recommendSupportCasePlaybooksController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    requireSupport(
      req,
    );

    const result =
      await recommendPlaybooksForCase(
        requiredAiRouteParam(req, "caseId"),
      );

    res.json({
      success:
        true,
      data:
        result,
      meta: {
        recommendationOnly:
          true,
        financialMutation:
          false,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function startSupportCasePlaybookController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const actor =
      requireSupport(
        req,
      );

    const playbookId =
      typeof req.body?.playbookId ===
        "string"
        ? req.body.playbookId
        : "";

    if (
      !playbookId.trim()
    ) {
      throw new CofferAiError({
        code:
          "AI_SUPPORT_PLAYBOOK_ID_REQUIRED",
        message:
          "A recommended playbookId is required.",
        statusCode:
          400,
      });
    }

    const result =
      await startPlaybookForCase({
        caseId:
          requiredAiRouteParam(req, "caseId"),
        playbookId:
          playbookId.trim(),
        supportUserId:
          actor.userId,
      });

    res.status(
      result.created
        ? 201
        : 200,
    ).json({
      success:
        true,
      data:
        result,
      meta: {
        guidedOnly:
          true,
        financialMutation:
          false,
        automaticFinancialAction:
          false,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getSupportPlaybookRunController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    requireSupport(
      req,
    );

    const result =
      await getPlaybookRun(
        requiredAiRouteParam(req, "runId"),
      );

    res.json({
      success:
        true,
      data:
        result,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateSupportPlaybookStepController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const actor =
      requireSupport(
        req,
      );

    const status =
      req.body?.status;

    if (
      status !==
        "completed" &&
      status !==
        "skipped"
    ) {
      throw new CofferAiError({
        code:
          "AI_SUPPORT_PLAYBOOK_STEP_STATUS_INVALID",
        message:
          "Step status must be completed or skipped.",
        statusCode:
          400,
      });
    }

    const result =
      await updatePlaybookStep({
        runId:
          requiredAiRouteParam(req, "runId"),
        stepId:
          requiredAiRouteParam(req, "stepId"),
        supportUserId:
          actor.userId,
        status,
        note:
          typeof req.body?.note ===
            "string"
            ? req.body.note
            : null,
      });

    res.json({
      success:
        true,
      data:
        result,
      meta: {
        guidedOnly:
          true,
        financialMutation:
          false,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function completeSupportPlaybookRunController(
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
      await completePlaybookRun({
        runId:
          requiredAiRouteParam(req, "runId"),
        supportUserId:
          actor.userId,
      });

    res.json({
      success:
        true,
      data:
        result,
      meta: {
        guidedOnly:
          true,
        financialMutation:
          false,
      },
    });
  } catch (error) {
    next(error);
  }
}
