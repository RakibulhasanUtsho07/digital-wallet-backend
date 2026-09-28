import { requiredAiRouteParam } from "./aiRouteParams.js";
import type {
  NextFunction,
  Request,
  Response,
} from "express";

import type {
  AuthRequest,
} from "../../../middlewares/authMiddleware.js";
import {
  CofferAiError,
} from "../errors/cofferAiError.js";
import {
  createKnowledgeDraftFromCase,
  getKnowledgeDraft,
  listKnowledgeDrafts,
  publishKnowledgeDraft,
  reviewKnowledgeDraft,
  submitKnowledgeDraft,
} from "../services/supportKnowledgeLearningService.js";

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

function requireUserId( 
  req: AuthRequest, 
  allowedRoles: ReadonlyArray<string>,
): string { 
  if (
    !req.user?._id
  ) {
    throw new CofferAiError({
      code:
        "AUTHENTICATION_REQUIRED",
      message:
        "Authentication is required.",
      statusCode:
        401,
    });
  } 
  if (!allowedRoles.includes(req.user.role)) {
    throw new CofferAiError({
      code: "AI_ROLE_SCOPE_REQUIRED",
      message: "This knowledge action is not available to this role.",
      statusCode: 403,
    });
  }
 
  return req.user._id; 
}

export async function createSupportKnowledgeDraftController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const supportUserId =
      requireUserId( 
        req as AuthRequest, 
        ["support"],
      );

    const result =
      await createKnowledgeDraftFromCase({
        caseId:
          requiredAiRouteParam(req, "caseId"),
        supportUserId,
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
        autoPublished:
          false,
        humanReviewRequired:
          true,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function listSupportKnowledgeDraftsController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    requireUserId( 
      req as AuthRequest, 
      ["support", "admin", "super_admin"],
    );

    const result =
      await listKnowledgeDrafts({
        status:
          typeof req.query.status ===
            "string"
            ? req.query.status
            : null,
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

export async function getSupportKnowledgeDraftController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    requireUserId( 
      req as AuthRequest, 
      ["support", "admin", "super_admin"],
    );

    const result =
      await getKnowledgeDraft(
        requiredAiRouteParam(req, "draftId"),
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

export async function submitSupportKnowledgeDraftController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const supportUserId =
      requireUserId( 
        req as AuthRequest, 
        ["support"],
      );

    const result =
      await submitKnowledgeDraft({
        draftId:
          requiredAiRouteParam(req, "draftId"),
        supportUserId,
      });

    res.json({
      success:
        true,
      data:
        result,
      meta: {
        published:
          false,
        awaitingHumanAdminReview:
          true,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function reviewSupportKnowledgeDraftController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const adminId =
      requireUserId( 
        req as AuthRequest, 
        ["admin", "super_admin"],
      );

    const action =
      req.body?.action;

    if (
      action !==
        "approve" &&
      action !==
        "reject"
    ) {
      throw new CofferAiError({
        code:
          "AI_SUPPORT_KNOWLEDGE_REVIEW_ACTION_INVALID",
        message:
          "Review action must be approve or reject.",
        statusCode:
          400,
      });
    }

    const result =
      await reviewKnowledgeDraft({
        draftId:
          requiredAiRouteParam(req, "draftId"),
        adminId,
        action,
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
        humanAdminReview:
          true,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function publishSupportKnowledgeDraftController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const adminId =
      requireUserId( 
        req as AuthRequest, 
        ["admin", "super_admin"],
      );

    const result =
      await publishKnowledgeDraft({
        draftId:
          requiredAiRouteParam(req, "draftId"),
        adminId,
      });

    res.status(201).json({
      success:
        true,
      data:
        result,
      meta: {
        publishedAfterHumanApproval:
          true,
      },
    });
  } catch (error) {
    next(error);
  }
}
