import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import {
  bulkUpdateAdminUsers,
  createAdminUser,
  getAdminUserById,
  getUserActivity,
  getUserManagementStats,
  getUserTransactions,
  listAdminUsers,
  ServiceError,
  softDeleteAdminUser,
  updateAdminUser,
} from "../services/userManagementService";
import {
  bulkUserUpdateSchema,
  createAdminUserSchema,
  kycUpdateSchema,
  roleUpdateSchema,
  suspendUserSchema,
  updateAdminUserSchema,
  userListQuerySchema,
  walletUpdateSchema,
} from "../validators/userManagementValidation";
import type { AuthenticatedRequest, UserListQuery } from "../types/userManagement";

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const query = userListQuerySchema.parse(req.query) as UserListQuery;
    res.status(200).json(await listAdminUsers(query));
  } catch (error) {
    handleControllerError(error, res, next);
  }
}

export async function getUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await getAdminUserById(String(req.params.id));
    if (!user) {
      res.status(404).json({ message: "User not found." });
      return;
    }
    res.status(200).json(user);
  } catch (error) {
    handleControllerError(error, res, next);
  }
}

export async function createUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const input = createAdminUserSchema.parse(req.body);
    const user = await createAdminUser(input, actorId(req));
    res.status(201).json(user);
  } catch (error) {
    handleControllerError(error, res, next);
  }
}

export async function updateUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const patch = updateAdminUserSchema.parse(req.body);
    res.status(200).json(await updateAdminUser(String(req.params.id), patch, actorId(req)));
  } catch (error) {
    handleControllerError(error, res, next);
  }
}

export async function deleteUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const reason = typeof req.body?.reason === "string" ? req.body.reason : "Deleted by administrator";
    await softDeleteAdminUser(String(req.params.id), actorId(req), reason);
    res.status(200).json({ deleted: true });
  } catch (error) {
    handleControllerError(error, res, next);
  }
}

export async function bulkUpdateUsers(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { ids, input } = bulkUserUpdateSchema.parse(req.body);
    res.status(200).json(await bulkUpdateAdminUsers(ids, input, actorId(req)));
  } catch (error) {
    handleControllerError(error, res, next);
  }
}

export async function suspendUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { reason } = suspendUserSchema.parse(req.body);
    const user = await updateAdminUser(
     String(req.params.id),
      { status: "suspended", walletStatus: "frozen", reason },
      actorId(req),
    );
    res.status(200).json(user);
  } catch (error) {
    handleControllerError(error, res, next);
  }
}

export async function changeUserRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const input = roleUpdateSchema.parse(req.body);
    res.status(200).json(await updateAdminUser(String(req.params.id), input, actorId(req)));
  } catch (error) {
    handleControllerError(error, res, next);
  }
}

export async function changeUserKyc(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const input = kycUpdateSchema.parse(req.body);
    res.status(200).json(await updateAdminUser(String(req.params.id), input, actorId(req)));
  } catch (error) {
    handleControllerError(error, res, next);
  }
}

export async function changeUserWallet(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const input = walletUpdateSchema.parse(req.body);
    res.status(200).json(await updateAdminUser(String(req.params.id), input, actorId(req)));
  } catch (error) {
    handleControllerError(error, res, next);
  }
}

export async function listUserTransactions(req: Request, res: Response, next: NextFunction) {
  try {
    const pagination = pageSchema.parse(req.query);
    res.status(200).json(await getUserTransactions(String(req.params.id), pagination.page, pagination.pageSize));
  } catch (error) {
    handleControllerError(error, res, next);
  }
}

export async function listUserActivity(req: Request, res: Response, next: NextFunction) {
  try {
    const pagination = pageSchema.parse(req.query);
    res.status(200).json(await getUserActivity(String(req.params.id), pagination.page, pagination.pageSize));
  } catch (error) {
    handleControllerError(error, res, next);
  }
}

export async function userStats(_req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await getUserManagementStats());
  } catch (error) {
    handleControllerError(error, res, next);
  }
}

export async function exportUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = userListQuerySchema.parse({ ...req.query, page: 1, pageSize: 100 });
    const { users } = await listAdminUsers({ ...(parsed as UserListQuery), page: 1, pageSize: 5000 });
    const headers = ["id", "name", "email", "phone", "role", "status", "kycStatus", "walletStatus", "riskLevel", "riskScore", "lastActive", "joinedAt"] as const;
    const csv = [
      headers.join(","),
      ...users.map((user) => headers.map((key) => csvCell(user[key])).join(",")),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="users-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.status(200).send(csv);
  } catch (error) {
    handleControllerError(error, res, next);
  }
}

function actorId(req: AuthenticatedRequest) {
  return String(req.user?._id ?? req.user?.id ?? req.user?.userId ?? "") || undefined;
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function handleControllerError(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof z.ZodError) {
    res.status(400).json({ message: "Invalid request.", issues: error.issues });
    return;
  }
  if (error instanceof ServiceError) {
    res.status(error.statusCode).json({ message: error.message });
    return;
  }
  if (isMongoDuplicateError(error)) {
    res.status(409).json({ message: "Email or phone already exists." });
    return;
  }
  next(error);
}

function isMongoDuplicateError(error: unknown): error is { code: number } {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}
