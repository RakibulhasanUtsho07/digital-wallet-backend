import { z } from "zod";

const role = z.enum(["user", "admin", "support", "analyst"]);
const status = z.enum(["active", "suspended", "restricted", "pending"]);
const kycStatus = z.enum(["not_started", "pending", "under_review", "verified", "rejected"]);
const walletStatus = z.enum(["active", "frozen", "restricted", "closed"]);
const riskLevel = z.enum(["low", "medium", "high"]);

export const userListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortField: z.enum([
    "name", "email", "status", "role", "kycStatus", "walletStatus",
    "riskScore", "lastActive", "joinedAt", "createdAt", "balance", "transactionCount",
  ]).default("lastActive"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
  status: status.optional(),
  kycStatus: kycStatus.optional(),
  role: role.optional(),
  riskLevel: riskLevel.optional(),
  walletStatus: walletStatus.optional(),
  activity: z.enum(["today", "week", "inactive"]).optional(),
});

export const createAdminUserSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(160),
  phone: z.string().trim().min(8).max(20),
  role: role.default("user"),
  avatarUrl: z.string().url().max(500).optional(),
});

export const updateAdminUserSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().toLowerCase().email().max(160).optional(),
  phone: z.string().trim().min(8).max(20).optional(),
  role: role.optional(),
  status: status.optional(),
  kycStatus: kycStatus.optional(),
  walletStatus: walletStatus.optional(),
  riskLevel: riskLevel.optional(),
  riskScore: z.number().int().min(0).max(100).optional(),
  avatarUrl: z.union([z.string().url().max(500), z.literal("")]).optional(),
  twoFactorEnabled: z.boolean().optional(),
  reason: z.string().trim().min(3).max(500).optional(),
}).strict();

export const bulkUserUpdateSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  input: updateAdminUserSchema,
}).strict();

export const suspendUserSchema = z.object({
  reason: z.string().trim().min(3).max(500),
}).strict();

export const roleUpdateSchema = z.object({ role, reason: z.string().trim().min(3).max(500).optional() }).strict();
export const kycUpdateSchema = z.object({ kycStatus, reason: z.string().trim().min(3).max(500).optional() }).strict();
export const walletUpdateSchema = z.object({ walletStatus, reason: z.string().trim().min(3).max(500).optional() }).strict();
