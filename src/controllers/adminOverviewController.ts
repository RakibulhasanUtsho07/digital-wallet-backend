import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import {
  getAdminOverview,
  overviewToCsv,
  recordOverviewExport,
} from "../services/adminOverviewService.js";
import { adminOverviewQuerySchema } from "../validators/adminOverviewValidation.js";

type AuthenticatedRequest = Request & {
  user?: { _id?: unknown; id?: unknown; userId?: unknown; sub?: unknown };
};

export async function adminOverview(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { range } = adminOverviewQuerySchema.parse(req.query);
    const data = await getAdminOverview(range);
    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json(data);
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function exportAdminOverview(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { range } = adminOverviewQuerySchema.parse(req.query);
    const data = await getAdminOverview(range);
    await recordOverviewExport(getActorId(req), range);
    
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="admin-overview-${range}-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.status(200).send(overviewToCsv(data));
  } catch (error) {
    handleError(error, res, next);
  }
}

function getActorId(req: AuthenticatedRequest): string | undefined {
  const value = req.user?._id ?? req.user?.id ?? req.user?.userId ?? req.user?.sub;
  return value === undefined || value === null ? undefined : String(value);
}

function handleError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({
      success: false,
      message: "Invalid overview range.",
      issues: error.issues,
    });
    return;
  }
  next(error);
}