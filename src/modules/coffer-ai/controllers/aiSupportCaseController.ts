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
  addSupportCaseNote,
  createOrRefreshSupportCase,
  getSupportCase,
  listSupportCases,
  updateSupportCase,
} from "../services/supportCaseWorkspaceService.js";
import {
  correlateSupportCase,
  getSupportIncident,
  listSupportIncidents,
  updateSupportIncident,
} from "../services/supportCaseCorrelationService.js";
import {
  getSupportCaseTimeline,
} from "../services/supportCaseTimelineService.js";
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
      `support-case-${Date.now()}`,
    );

  if (
    !actor.isAuthenticated ||
    actor.actorType !==
      "support" ||
    !actor.userId
  ) {
    throw new CofferAiError({
      code: "AI_SUPPORT_SCOPE_REQUIRED",
      message:
        "This AI Support Case Workspace is available only to Support Agent accounts.",
      statusCode: 403,
    });
  }

  return { ...actor, userId: actor.userId };
}

function positiveInteger(
  value: unknown,
  fallback: number,
): number {
  const parsed =
    Number.parseInt(
      String(
        value ??
        "",
      ),
      10,
    );

  return Number.isFinite(
    parsed,
  )
    ? Math.max(
        1,
        parsed,
      )
    : fallback;
}

export async function createSupportAiCaseController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const actor =
      requireSupport(
        req,
      );

    const message =
      typeof req.body?.message ===
        "string"
        ? req.body.message
        : "";

    const resourceId =
      typeof req.body?.resourceId ===
        "string"
        ? req.body.resourceId
        : null;

    if (
      !message.trim() &&
      !resourceId?.trim()
    ) {
      throw new CofferAiError({
        code: "AI_SUPPORT_CASE_REFERENCE_REQUIRED",
        message:
          "Provide a payment, transaction, or customer reference to create the case.",
        statusCode: 400,
      });
    }

    const result =
      await createOrRefreshSupportCase({
        message:
          message ||
          resourceId ||
          "",
        resourceId,
        supportUserId:
          actor.userId,
        assignToMe:
          req.body?.assignToMe ===
          true,
      });

    res.status(
      result.created
        ? 201
        : 200,
    ).json({
      success: true,
      data:
        result,
      meta: {
        role:
          "support",
        financialMutation:
          false,
        autoEscalation:
          false,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function listSupportAiCasesController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const actor =
      requireSupport(
        req,
      );

    const onlyMine =
      req.query.mine ===
      "true";

    const result =
      await listSupportCases({
        page:
          positiveInteger(
            req.query.page,
            1,
          ),
        limit:
          positiveInteger(
            req.query.limit,
            20,
          ),
        status:
          typeof req.query.status ===
            "string"
            ? req.query.status
            : null,
        queue:
          typeof req.query.queue ===
            "string"
            ? req.query.queue
            : null,
        priority:
          typeof req.query.priority ===
            "string"
            ? req.query.priority
            : null,
        assignedToUserId:
          onlyMine
            ? actor.userId
            : null,
      });

    res.json({
      success: true,
      data:
        result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getSupportAiCaseController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    requireSupport(
      req,
    );

    const result =
      await getSupportCase(
        requiredAiRouteParam(req, "caseId"),
      );

    res.json({
      success: true,
      data:
        result,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateSupportAiCaseController(
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
      await updateSupportCase({
        caseId:
          requiredAiRouteParam(req, "caseId"),
        supportUserId:
          actor.userId,
        status:
          typeof req.body?.status ===
            "string"
            ? req.body.status
            : undefined,
        assignToMe:
          req.body?.assignToMe ===
          true,
      });

    res.json({
      success: true,
      data:
        result,
      meta: {
        financialMutation:
          false,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function addSupportAiCaseNoteController(
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
      await addSupportCaseNote({
        caseId:
          requiredAiRouteParam(req, "caseId"),
        supportUserId:
          actor.userId,
        body:
          typeof req.body?.body ===
            "string"
            ? req.body.body
            : "",
      });

    res.status(201).json({
      success: true,
      data:
        result,
      meta: {
        financialMutation:
          false,
      },
    });
  } catch (error) {
    next(error);
  }
}


export async function getSupportAiCaseTimelineController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    requireSupport(req);
    const timeline = await getSupportCaseTimeline(requiredAiRouteParam(req, "caseId"));
    res.json({ success: true, data: { timeline } });
  } catch (error) {
    next(error);
  }
}

export async function getSupportAiCaseCorrelationController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    requireSupport(req);
    const correlation = await correlateSupportCase(requiredAiRouteParam(req, "caseId"));
    res.json({
      success: true,
      data: correlation,
      meta: {
        financialMutation: false,
        automaticFinancialAction: false,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function listSupportAiIncidentsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    requireSupport(req);
    const result = await listSupportIncidents({
      page: positiveInteger(req.query.page, 1),
      limit: positiveInteger(req.query.limit, 20),
      status: typeof req.query.status === "string" ? req.query.status : null,
      severity: typeof req.query.severity === "string" ? req.query.severity : null,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getSupportAiIncidentController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    requireSupport(req);
    const result = await getSupportIncident(requiredAiRouteParam(req, "incidentId"));
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function updateSupportAiIncidentController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const actor = requireSupport(req);
    const result = await updateSupportIncident({
      incidentId: requiredAiRouteParam(req, "incidentId"),
      supportUserId: actor.userId,
      status: typeof req.body?.status === "string" ? req.body.status : undefined,
      assignToMe: req.body?.assignToMe === true,
    });

    res.json({
      success: true,
      data: result,
      meta: {
        financialMutation: false,
        automaticFinancialAction: false,
      },
    });
  } catch (error) {
    next(error);
  }
}
