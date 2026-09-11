"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listUsers = listUsers;
exports.getUser = getUser;
exports.createUser = createUser;
exports.updateUser = updateUser;
exports.deleteUser = deleteUser;
exports.bulkUpdateUsers = bulkUpdateUsers;
exports.suspendUser = suspendUser;
exports.changeUserRole = changeUserRole;
exports.changeUserKyc = changeUserKyc;
exports.changeUserWallet = changeUserWallet;
exports.listUserTransactions = listUserTransactions;
exports.listUserActivity = listUserActivity;
exports.userStats = userStats;
exports.exportUsers = exportUsers;
const zod_1 = require("zod");
const userManagementService_1 = require("../services/userManagementService");
const userManagementValidation_1 = require("../validators/userManagementValidation");
const pageSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(100).default(20),
});
async function listUsers(req, res, next) {
    try {
        const query = userManagementValidation_1.userListQuerySchema.parse(req.query);
        res.status(200).json(await (0, userManagementService_1.listAdminUsers)(query));
    }
    catch (error) {
        handleControllerError(error, res, next);
    }
}
async function getUser(req, res, next) {
    try {
        const user = await (0, userManagementService_1.getAdminUserById)(String(req.params.id));
        if (!user) {
            res.status(404).json({ message: "User not found." });
            return;
        }
        res.status(200).json(user);
    }
    catch (error) {
        handleControllerError(error, res, next);
    }
}
async function createUser(req, res, next) {
    try {
        const input = userManagementValidation_1.createAdminUserSchema.parse(req.body);
        const user = await (0, userManagementService_1.createAdminUser)(input, actorId(req));
        res.status(201).json(user);
    }
    catch (error) {
        handleControllerError(error, res, next);
    }
}
async function updateUser(req, res, next) {
    try {
        const patch = userManagementValidation_1.updateAdminUserSchema.parse(req.body);
        res.status(200).json(await (0, userManagementService_1.updateAdminUser)(String(req.params.id), patch, actorId(req)));
    }
    catch (error) {
        handleControllerError(error, res, next);
    }
}
async function deleteUser(req, res, next) {
    try {
        const reason = typeof req.body?.reason === "string" ? req.body.reason : "Deleted by administrator";
        await (0, userManagementService_1.softDeleteAdminUser)(String(req.params.id), actorId(req), reason);
        res.status(200).json({ deleted: true });
    }
    catch (error) {
        handleControllerError(error, res, next);
    }
}
async function bulkUpdateUsers(req, res, next) {
    try {
        const { ids, input } = userManagementValidation_1.bulkUserUpdateSchema.parse(req.body);
        res.status(200).json(await (0, userManagementService_1.bulkUpdateAdminUsers)(ids, input, actorId(req)));
    }
    catch (error) {
        handleControllerError(error, res, next);
    }
}
async function suspendUser(req, res, next) {
    try {
        const { reason } = userManagementValidation_1.suspendUserSchema.parse(req.body);
        const user = await (0, userManagementService_1.updateAdminUser)(String(req.params.id), { status: "suspended", walletStatus: "frozen", reason }, actorId(req));
        res.status(200).json(user);
    }
    catch (error) {
        handleControllerError(error, res, next);
    }
}
async function changeUserRole(req, res, next) {
    try {
        const input = userManagementValidation_1.roleUpdateSchema.parse(req.body);
        res.status(200).json(await (0, userManagementService_1.updateAdminUser)(String(req.params.id), input, actorId(req)));
    }
    catch (error) {
        handleControllerError(error, res, next);
    }
}
async function changeUserKyc(req, res, next) {
    try {
        const input = userManagementValidation_1.kycUpdateSchema.parse(req.body);
        res.status(200).json(await (0, userManagementService_1.updateAdminUser)(String(req.params.id), input, actorId(req)));
    }
    catch (error) {
        handleControllerError(error, res, next);
    }
}
async function changeUserWallet(req, res, next) {
    try {
        const input = userManagementValidation_1.walletUpdateSchema.parse(req.body);
        res.status(200).json(await (0, userManagementService_1.updateAdminUser)(String(req.params.id), input, actorId(req)));
    }
    catch (error) {
        handleControllerError(error, res, next);
    }
}
async function listUserTransactions(req, res, next) {
    try {
        const pagination = pageSchema.parse(req.query);
        res.status(200).json(await (0, userManagementService_1.getUserTransactions)(String(req.params.id), pagination.page, pagination.pageSize));
    }
    catch (error) {
        handleControllerError(error, res, next);
    }
}
async function listUserActivity(req, res, next) {
    try {
        const pagination = pageSchema.parse(req.query);
        res.status(200).json(await (0, userManagementService_1.getUserActivity)(String(req.params.id), pagination.page, pagination.pageSize));
    }
    catch (error) {
        handleControllerError(error, res, next);
    }
}
async function userStats(_req, res, next) {
    try {
        res.status(200).json(await (0, userManagementService_1.getUserManagementStats)());
    }
    catch (error) {
        handleControllerError(error, res, next);
    }
}
async function exportUsers(req, res, next) {
    try {
        const parsed = userManagementValidation_1.userListQuerySchema.parse({ ...req.query, page: 1, pageSize: 100 });
        const { users } = await (0, userManagementService_1.listAdminUsers)({ ...parsed, page: 1, pageSize: 5000 });
        const headers = ["id", "name", "email", "phone", "role", "status", "kycStatus", "walletStatus", "riskLevel", "riskScore", "lastActive", "joinedAt"];
        const csv = [
            headers.join(","),
            ...users.map((user) => headers.map((key) => csvCell(user[key])).join(",")),
        ].join("\n");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="users-${new Date().toISOString().slice(0, 10)}.csv"`);
        res.status(200).send(csv);
    }
    catch (error) {
        handleControllerError(error, res, next);
    }
}
function actorId(req) {
    return String(req.user?._id ?? req.user?.id ?? req.user?.userId ?? "") || undefined;
}
function csvCell(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
}
function handleControllerError(error, res, next) {
    if (error instanceof zod_1.z.ZodError) {
        res.status(400).json({ message: "Invalid request.", issues: error.issues });
        return;
    }
    if (error instanceof userManagementService_1.ServiceError) {
        res.status(error.statusCode).json({ message: error.message });
        return;
    }
    if (isMongoDuplicateError(error)) {
        res.status(409).json({ message: "Email or phone already exists." });
        return;
    }
    next(error);
}
function isMongoDuplicateError(error) {
    return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}
