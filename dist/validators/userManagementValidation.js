"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletUpdateSchema = exports.kycUpdateSchema = exports.roleUpdateSchema = exports.suspendUserSchema = exports.bulkUserUpdateSchema = exports.updateAdminUserSchema = exports.createAdminUserSchema = exports.userListQuerySchema = void 0;
const zod_1 = require("zod");
const role = zod_1.z.enum(["user", "admin", "support", "analyst"]);
const status = zod_1.z.enum(["active", "suspended", "restricted", "pending"]);
const kycStatus = zod_1.z.enum(["not_started", "pending", "under_review", "verified", "rejected"]);
const walletStatus = zod_1.z.enum(["active", "frozen", "restricted", "closed"]);
const riskLevel = zod_1.z.enum(["low", "medium", "high"]);
exports.userListQuerySchema = zod_1.z.object({
    search: zod_1.z.string().trim().max(100).optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(100).default(10),
    sortField: zod_1.z.enum([
        "name", "email", "status", "role", "kycStatus", "walletStatus",
        "riskScore", "lastActive", "joinedAt", "createdAt", "balance", "transactionCount",
    ]).default("lastActive"),
    sortDirection: zod_1.z.enum(["asc", "desc"]).default("desc"),
    status: status.optional(),
    kycStatus: kycStatus.optional(),
    role: role.optional(),
    riskLevel: riskLevel.optional(),
    walletStatus: walletStatus.optional(),
    activity: zod_1.z.enum(["today", "week", "inactive"]).optional(),
});
exports.createAdminUserSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2).max(80),
    email: zod_1.z.string().trim().toLowerCase().email().max(160),
    phone: zod_1.z.string().trim().min(8).max(20),
    role: role.default("user"),
    avatarUrl: zod_1.z.string().url().max(500).optional(),
});
exports.updateAdminUserSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(2).max(80).optional(),
    email: zod_1.z.string().trim().toLowerCase().email().max(160).optional(),
    phone: zod_1.z.string().trim().min(8).max(20).optional(),
    role: role.optional(),
    status: status.optional(),
    kycStatus: kycStatus.optional(),
    walletStatus: walletStatus.optional(),
    riskLevel: riskLevel.optional(),
    riskScore: zod_1.z.number().int().min(0).max(100).optional(),
    avatarUrl: zod_1.z.union([zod_1.z.string().url().max(500), zod_1.z.literal("")]).optional(),
    twoFactorEnabled: zod_1.z.boolean().optional(),
    reason: zod_1.z.string().trim().min(3).max(500).optional(),
}).strict();
exports.bulkUserUpdateSchema = zod_1.z.object({
    ids: zod_1.z.array(zod_1.z.string().min(1)).min(1).max(100),
    input: exports.updateAdminUserSchema,
}).strict();
exports.suspendUserSchema = zod_1.z.object({
    reason: zod_1.z.string().trim().min(3).max(500),
}).strict();
exports.roleUpdateSchema = zod_1.z.object({ role, reason: zod_1.z.string().trim().min(3).max(500).optional() }).strict();
exports.kycUpdateSchema = zod_1.z.object({ kycStatus, reason: zod_1.z.string().trim().min(3).max(500).optional() }).strict();
exports.walletUpdateSchema = zod_1.z.object({ walletStatus, reason: zod_1.z.string().trim().min(3).max(500).optional() }).strict();
