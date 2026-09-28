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
  getSupportCommandCenterSnapshot,
} from "../services/supportCommandCenterService.js";
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
      `support-command-center-${Date.now()}`,
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
        "The Support AI Command Center is available only to Support Agent accounts.",
      statusCode: 403,
    });
  }

  return actor;
}

export async function getSupportAiCommandCenterController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    requireSupport(
      req,
    );

    const result =
      await getSupportCommandCenterSnapshot({
        range:
          typeof req.query.range ===
            "string"
            ? req.query.range
            : undefined,
      });

    res.json({
      success: true,
      data:
        result,
      meta: {
        role:
          "support",
        readOnly:
          true,
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
