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
  evaluateSupportProactiveAlerts,
  getSupportAlert,
  listSupportAlerts,
  updateSupportAlert,
} from "../services/supportProactiveAlertService.js";
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
      `support-alert-${Date.now()}`,
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
        "The Support proactive alert feed is available only to Support Agent accounts.",
      statusCode:
        403,
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

export async function evaluateSupportAlertsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    requireSupport(
      req,
    );

    const result =
      await evaluateSupportProactiveAlerts();

    res.json({
      success:
        true,
      data:
        result,
      meta: {
        financialMutation:
          false,
        aiProviderRequired:
          false,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function listSupportAlertsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    requireSupport(
      req,
    );

    const result =
      await listSupportAlerts({
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
        severity:
          typeof req.query.severity ===
            "string"
            ? req.query.severity
            : null,
        type:
          typeof req.query.type ===
            "string"
            ? req.query.type
            : null,
      });

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

export async function getSupportAlertController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    requireSupport(
      req,
    );

    const result =
      await getSupportAlert(
        requiredAiRouteParam(req, "alertId"),
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

export async function updateSupportAlertController(
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
        "acknowledged" &&
      status !==
        "resolved"
    ) {
      throw new CofferAiError({
        code:
          "AI_SUPPORT_ALERT_STATUS_INVALID",
        message:
          "Alert status must be acknowledged or resolved.",
        statusCode:
          400,
      });
    }

    const result =
      await updateSupportAlert({
        alertId:
          requiredAiRouteParam(req, "alertId"),
        supportUserId:
          actor.userId,
        status,
      });

    res.json({
      success:
        true,
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
