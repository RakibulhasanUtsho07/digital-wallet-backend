"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceError = void 0;
exports.listAdminUsers = listAdminUsers;
exports.getAdminUserById = getAdminUserById;
exports.createAdminUser = createAdminUser;
exports.updateAdminUser = updateAdminUser;
exports.softDeleteAdminUser = softDeleteAdminUser;
exports.bulkUpdateAdminUsers = bulkUpdateAdminUsers;
exports.getUserTransactions = getUserTransactions;
exports.getUserActivity = getUserActivity;
exports.getUserManagementStats = getUserManagementStats;
const node_crypto_1 = require("node:crypto");
const bcryptjs_1 = require("bcryptjs");
const mongoose_1 = require("mongoose");
const userManagementModelRegistry_1 = require("./userManagementModelRegistry");
const userPublicFields = "-password -passwordHash -refreshToken -resetPasswordToken -twoFactorSecret -__v";
async function listAdminUsers(query) {
    const databaseFilter = {
        $and: [
            { $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] },
        ],
    };
    const conditions = databaseFilter.$and;
    if (query.search) {
        const search = new RegExp(escapeRegExp(query.search), "i");
        conditions.push({ $or: [{ name: search }, { email: search }, { phone: search }] });
    }
    if (query.status)
        conditions.push({ status: query.status });
    if (query.role)
        conditions.push({ role: query.role });
    if (query.riskLevel)
        conditions.push({ riskLevel: query.riskLevel });
    const sourceUsers = await userManagementModelRegistry_1.UserModel.find(databaseFilter)
        .select(userPublicFields)
        .limit(5000)
        .lean()
        .exec();
    let users = await decorateUsers(sourceUsers);
    users = users.filter((user) => {
        if (query.kycStatus && user.kycStatus !== query.kycStatus)
            return false;
        if (query.walletStatus && user.walletStatus !== query.walletStatus)
            return false;
        if (query.activity) {
            const age = Date.now() - new Date(user.lastActive).getTime();
            if (query.activity === "today" && age > 86_400_000)
                return false;
            if (query.activity === "week" && age > 604_800_000)
                return false;
            if (query.activity === "inactive" && age <= 2_592_000_000)
                return false;
        }
        return true;
    });
    users.sort((a, b) => {
        const first = sortableValue(a, query.sortField);
        const second = sortableValue(b, query.sortField);
        const result = typeof first === "number" && typeof second === "number"
            ? first - second
            : String(first).localeCompare(String(second));
        return query.sortDirection === "asc" ? result : -result;
    });
    const total = users.length;
    const start = (query.page - 1) * query.pageSize;
    return { users: users.slice(start, start + query.pageSize), total, page: query.page, pageSize: query.pageSize };
}
async function getAdminUserById(id) {
    const user = await userManagementModelRegistry_1.UserModel.findById(toObjectId(id)).select(userPublicFields).lean().exec();
    if (!user)
        return null;
    const [record] = await decorateUsers([user]);
    return record ?? null;
}
async function createAdminUser(input, actorId) {
    const existing = await userManagementModelRegistry_1.UserModel.findOne({
        $or: [{ email: input.email.toLowerCase() }, { phone: input.phone }],
    }).lean().exec();
    if (existing)
        throw new ServiceError(409, "A user with this email or phone already exists.");
    const unusableSecret = (0, node_crypto_1.randomBytes)(32).toString("base64url");
    const passwordHash = await (0, bcryptjs_1.hash)(unusableSecret, 12);
    const created = await userManagementModelRegistry_1.UserModel.create({
        name: input.name,
        email: input.email.toLowerCase(),
        phone: input.phone,
        role: input.role,
        avatarUrl: input.avatarUrl,
        status: "pending",
        riskLevel: "low",
        riskScore: 0,
        password: passwordHash,
        passwordHash,
        mustResetPassword: true,
        lastActiveAt: new Date(),
    });
    const userId = String(created._id);
    await Promise.all([
        userManagementModelRegistry_1.WalletModel.findOneAndUpdate({ $or: [{ userId: created._id }, { user: created._id }] }, { $setOnInsert: { userId: created._id, user: created._id, status: "active", balance: 0, availableBalanceMinor: 0, currency: "BDT" } }, { upsert: true, new: true }).exec(),
        userManagementModelRegistry_1.KYCModel.findOneAndUpdate({ $or: [{ userId: created._id }, { user: created._id }] }, { $setOnInsert: { userId: created._id, user: created._id, status: "not_started" } }, { upsert: true, new: true }).exec(),
    ]);
    await writeAudit({ actorId, targetUserId: userId, action: "admin.user.created", after: input });
    return getAdminUserById(userId);
}
async function updateAdminUser(id, patch, actorId) {
    const objectId = toObjectId(id);
    const before = await getAdminUserById(id);
    if (!before)
        throw new ServiceError(404, "User not found.");
    const userPatch = pickDefined(patch, [
        "name", "email", "phone", "role", "status", "riskLevel", "riskScore", "avatarUrl", "twoFactorEnabled",
    ]);
    if (typeof userPatch.email === "string")
        userPatch.email = userPatch.email.toLowerCase();
    const tasks = [];
    if (Object.keys(userPatch).length) {
        tasks.push(userManagementModelRegistry_1.UserModel.findByIdAndUpdate(objectId, { $set: userPatch }, { new: true, runValidators: true }).exec());
    }
    if (patch.walletStatus) {
        tasks.push(userManagementModelRegistry_1.WalletModel.findOneAndUpdate({ $or: [{ userId: objectId }, { user: objectId }] }, { $set: { status: patch.walletStatus } }, { upsert: true, new: true, runValidators: true }).exec());
    }
    if (patch.kycStatus) {
        tasks.push(userManagementModelRegistry_1.KYCModel.findOneAndUpdate({ $or: [{ userId: objectId }, { user: objectId }] }, { $set: { status: patch.kycStatus, reviewedAt: new Date(), reviewedBy: actorId || undefined, reason: patch.reason } }, { upsert: true, new: true, runValidators: true }).exec());
    }
    await Promise.all(tasks);
    const after = await getAdminUserById(id);
    await writeAudit({ actorId, targetUserId: id, action: "admin.user.updated", before, after, reason: patch.reason });
    return after;
}
async function softDeleteAdminUser(id, actorId, reason = "Deleted by administrator") {
    const objectId = toObjectId(id);
    const before = await getAdminUserById(id);
    if (!before)
        throw new ServiceError(404, "User not found.");
    await Promise.all([
        userManagementModelRegistry_1.UserModel.findByIdAndUpdate(objectId, { $set: { status: "suspended", deletedAt: new Date() } }, { new: true }).exec(),
        userManagementModelRegistry_1.WalletModel.findOneAndUpdate({ $or: [{ userId: objectId }, { user: objectId }] }, { $set: { status: "frozen" } }, { new: true }).exec(),
        userManagementModelRegistry_1.AuthSessionModel.updateMany({ $or: [{ userId: objectId }, { user: objectId }] }, { $set: { revokedAt: new Date() } }).exec(),
    ]);
    await writeAudit({ actorId, targetUserId: id, action: "admin.user.deleted", before, reason });
}
async function bulkUpdateAdminUsers(ids, patch, actorId) {
    const uniqueIds = [...new Set(ids)];
    await Promise.all(uniqueIds.map((id) => updateAdminUser(id, patch, actorId)));
    return { updated: uniqueIds.length };
}
async function getUserTransactions(id, page, pageSize) {
    const user = await getAdminUserById(id);
    if (!user)
        throw new ServiceError(404, "User not found.");
    const userObjectId = toObjectId(id);
    const walletObjectId = mongoose_1.Types.ObjectId.isValid(user.walletId) ? new mongoose_1.Types.ObjectId(user.walletId) : user.walletId;
    const filter = {
        $or: [
            { userId: userObjectId }, { user: userObjectId },
            { senderWalletId: walletObjectId }, { receiverWalletId: walletObjectId },
            { sender: userObjectId }, { receiver: userObjectId },
        ],
    };
    const [documents, total] = await Promise.all([
        userManagementModelRegistry_1.TransactionModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean().exec(),
        userManagementModelRegistry_1.TransactionModel.countDocuments(filter).exec(),
    ]);
    return { transactions: documents.map(normalizeTransaction), total, page, pageSize };
}
async function getUserActivity(id, page, pageSize) {
    const objectId = toObjectId(id);
    const filter = { $or: [{ targetUserId: objectId }, { targetUserId: id }, { userId: objectId }, { user: objectId }] };
    const [documents, total] = await Promise.all([
        userManagementModelRegistry_1.AuditLogModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean().exec(),
        userManagementModelRegistry_1.AuditLogModel.countDocuments(filter).exec(),
    ]);
    return {
        activities: documents.map((document) => ({
            id: recordId(document),
            type: stringValue(document.type ?? document.category ?? "admin"),
            title: stringValue(document.title ?? document.action ?? "Account activity"),
            description: stringValue(document.description ?? document.reason ?? "Account activity recorded."),
            createdAt: isoValue(document.createdAt),
            ipAddress: optionalString(document.ipAddress ?? document.ip),
        })),
        total, page, pageSize,
    };
}
async function getUserManagementStats() {
    const result = await listAdminUsers({ page: 1, pageSize: 5000, sortField: "lastActive", sortDirection: "desc" });
    const users = result.users;
    const weekAgo = Date.now() - 604_800_000;
    return {
        totalUsers: result.total,
        activeUsers: users.filter((user) => user.status === "active").length,
        suspended: users.filter((user) => user.status === "suspended").length,
        pendingKyc: users.filter((user) => ["pending", "under_review"].includes(user.kycStatus)).length,
        highRisk: users.filter((user) => user.riskLevel === "high").length,
        newThisWeek: users.filter((user) => new Date(user.joinedAt).getTime() >= weekAgo).length,
    };
}
async function decorateUsers(users) {
    const ids = users.map((user) => user._id).filter(Boolean);
    if (!ids.length)
        return [];
    const relatedFilter = { $or: [{ userId: { $in: ids } }, { user: { $in: ids } }] };
    const [wallets, kycCases, sessionCounts] = await Promise.all([
        userManagementModelRegistry_1.WalletModel.find(relatedFilter).lean().exec(),
        userManagementModelRegistry_1.KYCModel.find(relatedFilter).lean().exec(),
        userManagementModelRegistry_1.AuthSessionModel.aggregate([
            { $match: { ...relatedFilter, revokedAt: { $in: [null, undefined] }, expiresAt: { $gt: new Date() } } },
            { $group: { _id: { $ifNull: ["$userId", "$user"] }, count: { $sum: 1 } } },
        ]).exec(),
    ]);
    const walletByUser = indexByUser(wallets);
    const kycByUser = indexByUser(kycCases);
    const sessionsByUser = new Map(sessionCounts.map((item) => [String(item._id), item.count]));
    return users.map((user) => normalizeUser(user, walletByUser.get(recordId(user)), kycByUser.get(recordId(user)), sessionsByUser.get(recordId(user)) ?? numberValue(user.activeSessions)));
}
function normalizeUser(user, wallet, kyc, activeSessions = 0) {
    const status = normalizeStatus(user.status, user.isBlocked);
    const riskScore = clamp(numberValue(user.riskScore), 0, 100);
    return {
        id: recordId(user),
        name: stringValue(user.name ?? [user.firstName, user.lastName].filter(Boolean).join(" ") ?? "Unknown user"),
        email: stringValue(user.email),
        phone: stringValue(user.phone),
        role: normalizeRole(user.role),
        status,
        kycStatus: normalizeKycStatus(kyc?.status ?? user.kycStatus),
        walletStatus: normalizeWalletStatus(wallet?.status ?? user.walletStatus),
        riskLevel: normalizeRiskLevel(user.riskLevel, riskScore),
        riskScore,
        balance: moneyFromFields(wallet, ["balance", "availableBalance"], ["balanceMinor", "availableBalanceMinor"]),
        totalReceived: moneyFromFields(wallet, ["totalReceived"], ["totalReceivedMinor"]),
        totalSent: moneyFromFields(wallet, ["totalSent"], ["totalSentMinor"]),
        transactionCount: numberValue(wallet?.transactionCount ?? user.transactionCount),
        lastActive: isoValue(user.lastActiveAt ?? user.lastActive ?? user.updatedAt ?? user.createdAt),
        joinedAt: isoValue(user.createdAt ?? user.joinedAt),
        city: stringValue(user.city ?? user.addressCity ?? ""),
        country: stringValue(user.country ?? "Bangladesh"),
        walletId: wallet ? recordId(wallet) : "",
        twoFactorEnabled: Boolean(user.twoFactorEnabled ?? user.isTwoFactorEnabled),
        failedLoginCount: numberValue(user.failedLoginCount),
        activeSessions,
        avatarUrl: optionalString(user.avatarUrl ?? user.profileImage ?? user.photoURL),
    };
}
async function writeAudit(entry) {
    if (!entry.actorId) {
        throw new ServiceError(401, "Authenticated administrator identity is missing.");
    }
    const actor = mongoose_1.Types.ObjectId.isValid(entry.actorId)
        ? new mongoose_1.Types.ObjectId(entry.actorId)
        : entry.actorId;
    const targetUser = mongoose_1.Types.ObjectId.isValid(entry.targetUserId)
        ? new mongoose_1.Types.ObjectId(entry.targetUserId)
        : entry.targetUserId;
    await userManagementModelRegistry_1.AuditLogModel.create({
        // তোমার AuditLog model-এর required field
        actor,
        // Compatibility fields
        actorId: actor,
        targetUser,
        targetUserId: targetUser,
        action: entry.action,
        before: entry.before,
        after: entry.after,
        reason: entry.reason,
        createdAt: new Date(),
    });
}
function indexByUser(records) {
    const result = new Map();
    records.forEach((record) => {
        const key = String(record.userId ?? record.user ?? "");
        if (key)
            result.set(key, record);
    });
    return result;
}
function normalizeTransaction(transaction) {
    return {
        id: recordId(transaction),
        type: stringValue(transaction.type ?? "send"),
        amount: transaction.amount != null
            ? numberValue(transaction.amount)
            : numberValue(transaction.amountMinor) / 100,
        status: stringValue(transaction.status ?? "pending"),
        counterparty: stringValue(transaction.counterparty ?? transaction.reference ?? "Wallet transaction"),
        createdAt: isoValue(transaction.createdAt),
    };
}
function sortableValue(user, field) {
    if (field === "riskScore")
        return user.riskScore;
    if (field === "lastActive" || field === "joinedAt")
        return new Date(user[field]).getTime();
    if (field === "createdAt")
        return new Date(user.joinedAt).getTime();
    return user[field];
}
function toObjectId(id) {
    if (!mongoose_1.Types.ObjectId.isValid(id))
        throw new ServiceError(400, "Invalid user id.");
    return new mongoose_1.Types.ObjectId(id);
}
function recordId(record) { return String(record._id ?? record.id ?? ""); }
function stringValue(value) { return typeof value === "string" ? value : value == null ? "" : String(value); }
function optionalString(value) { const result = stringValue(value); return result || undefined; }
function numberValue(value) { const result = Number(value ?? 0); return Number.isFinite(result) ? result : 0; }
function moneyFromFields(record, majorFields, minorFields) {
    if (!record)
        return 0;
    for (const field of majorFields) {
        if (record[field] != null)
            return numberValue(record[field]);
    }
    for (const field of minorFields) {
        if (record[field] != null)
            return numberValue(record[field]) / 100;
    }
    return 0;
}
function isoValue(value) { const date = value ? new Date(value) : new Date(0); return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString(); }
function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function normalizeRole(value) {
    const role = stringValue(value).toLowerCase();
    if (role === "administrator")
        return "admin";
    return ["admin", "support", "analyst"].includes(role) ? role : "user";
}
function normalizeStatus(value, blocked) {
    if (blocked === true)
        return "suspended";
    const status = stringValue(value).toLowerCase();
    if (["blocked", "disabled", "inactive"].includes(status))
        return "suspended";
    return ["active", "suspended", "restricted", "pending"].includes(status) ? status : "active";
}
function normalizeKycStatus(value) {
    const status = stringValue(value).toLowerCase().replaceAll("-", "_");
    if (status === "approved")
        return "verified";
    if (["submitted", "awaiting_review"].includes(status))
        return "pending";
    if (["in_review", "reviewing"].includes(status))
        return "under_review";
    return ["not_started", "pending", "under_review", "verified", "rejected"].includes(status) ? status : "not_started";
}
function normalizeWalletStatus(value) {
    const status = stringValue(value).toLowerCase();
    if (["locked", "blocked"].includes(status))
        return "frozen";
    if (["disabled", "inactive"].includes(status))
        return "closed";
    return ["active", "frozen", "restricted", "closed"].includes(status) ? status : "active";
}
function normalizeRiskLevel(value, score) {
    const level = stringValue(value).toLowerCase();
    if (level === "critical")
        return "high";
    if (["low", "medium", "high"].includes(level))
        return level;
    return score >= 70 ? "high" : score >= 40 ? "medium" : "low";
}
function pickDefined(source, keys) {
    const result = {};
    keys.forEach((key) => { if (source[key] !== undefined)
        result[String(key)] = source[key]; });
    return result;
}
class ServiceError extends Error {
    statusCode;
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
        this.name = "ServiceError";
    }
}
exports.ServiceError = ServiceError;
