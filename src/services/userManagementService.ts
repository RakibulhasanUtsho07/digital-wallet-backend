import { randomBytes } from "node:crypto";
import { Types, type Model } from "mongoose";
import { SecurityPreferences } from "../models/SecurityPreferences.js";
import { createLookupHash, decryptData, encryptData, normalizeEmail, normalizePhone, type EncryptedData } from "../utils/crypto.js";
import { hashPassword } from "../utils/password.js";
import {
  AuditLogModel,
  AuthSessionModel,
  TransactionModel,
  UserModel,
  WalletModel,
} from "./userManagementModelRegistry";
import { currentEKYCStatus, currentEKYCStatuses } from "./identityVerificationService.js";
import type {
  AdminUserRecord,
  DbRecord,
  KYCStatus,
  RiskLevel,
  UserListQuery,
  UserRole,
  UserStatus,
  WalletStatus,
} from "../types/userManagement";

type Patch = Partial<AdminUserRecord> & { reason?: string };

const userPublicFields = "-password -passwordHash -refreshToken -resetPasswordToken -twoFactorSecret -__v";

export async function listAdminUsers(query: UserListQuery) {
  const databaseFilter: Record<string, unknown> = {
    $and: [
      { $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] },
    ],
  };

  const conditions = databaseFilter.$and as Array<Record<string, unknown>>;
  // Email and phone are encrypted. Search after decrypting authorized records.
  if (query.role) conditions.push({ role: query.role });

  const sourceUsers = await UserModel.find(databaseFilter)
    .select(userPublicFields)
    .lean()
    .exec() as unknown as DbRecord[];

  let users = await decorateUsers(sourceUsers);
  users = users.filter((user) => {
    if (query.search && ![user.name, user.email, user.phone].some((value) =>
      value.toLocaleLowerCase().includes(query.search!.toLocaleLowerCase()))) return false;
    if (query.status && user.status !== query.status) return false;
    if (query.riskLevel && user.riskLevel !== query.riskLevel) return false;
    if (query.kycStatus && user.kycStatus !== query.kycStatus) return false;
    if (query.walletStatus && user.walletStatus !== query.walletStatus) return false;
    if (query.activity) {
      const age = Date.now() - new Date(user.lastActive).getTime();
      if (query.activity === "today" && age > 86_400_000) return false;
      if (query.activity === "week" && age > 604_800_000) return false;
      if (query.activity === "inactive" && age <= 2_592_000_000) return false;
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

export async function getAdminUserById(id: string) {
  const user = await UserModel.findById(toObjectId(id)).select(userPublicFields).lean().exec() as unknown as DbRecord | null;
  if (!user) return null;
  const [record] = await decorateUsers([user]);
  return record ?? null;
}

export async function createAdminUser(input: {
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  avatarUrl?: string;
}, actorId?: string) {
  const existing = await UserModel.findOne({
    $or: [
      { emailLookup: createLookupHash(normalizeEmail(input.email)) },
      { phoneLookup: createLookupHash(normalizePhone(input.phone)) },
    ],
  }).lean().exec();
  if (existing) throw new ServiceError(409, "A user with this email or phone already exists.");

  const unusableSecret = randomBytes(32).toString("base64url");
  const passwordHash = await hashPassword(unusableSecret);
  const created = await UserModel.create({
    name: input.name,
    emailEncrypted: encryptData(normalizeEmail(input.email)),
    emailLookup: createLookupHash(normalizeEmail(input.email)),
    phoneEncrypted: encryptData(normalizePhone(input.phone)),
    phoneLookup: createLookupHash(normalizePhone(input.phone)),
    role: input.role,
    avatarUrl: input.avatarUrl,
    status: "pending",
    kycStatus: "not_started",
    riskLevel: "low",
    riskScore: 0,
    password: passwordHash,
    emailVerified: false,
  });

  const userId = String(created._id);
  const walletFilter = userReferenceFilter(WalletModel, created._id);
  const walletInsert = knownModelFields(WalletModel, {
    ...walletFilter,
    status: "PENDING_KYC",
    balance: 0,
    pendingBalance: 0,
    availableBalanceMinor: 0,
    currency: "BDT",
  });

  await WalletModel.findOneAndUpdate(
    walletFilter,
    { $setOnInsert: walletInsert },
    { upsert: true, new: true, runValidators: true },
  ).exec();

  // The KYC record is created only after identity evidence is submitted.
  // An empty upsert would violate the advanced e-KYC schema.

  await writeAudit({ actorId, targetUserId: userId, action: "admin.user.created", after: input });
  return getAdminUserById(userId);
}

export async function updateAdminUser(id: string, patch: Patch, actorId?: string) {
  const objectId = toObjectId(id);
  const before = await getAdminUserById(id);
  if (!before) throw new ServiceError(404, "User not found.");
  const existing = await UserModel.findById(objectId).select("accountStatus deletedAt").lean().exec() as DbRecord | null;
  if (!existing || existing.accountStatus === "deleted" || existing.deletedAt) {
    throw new ServiceError(409, "A deleted account cannot be updated.");
  }
  if (patch.kycStatus !== undefined) {
    throw new ServiceError(409, "e-KYC decisions must be made in the e-KYC review queue.");
  }
  if (patch.walletStatus === "active" && await currentEKYCStatus(id) !== "verified") {
    throw new ServiceError(409, "A wallet cannot be activated before e-KYC is verified.");
  }
  if (patch.twoFactorEnabled !== undefined) {
    throw new ServiceError(409, "Two-factor authentication must be changed through the account security flow.");
  }
  if (patch.walletStatus === "active" &&
      (patch.status === "suspended" || (existing.accountStatus === "suspended" && patch.status !== "active"))) {
    throw new ServiceError(409, "A suspended account cannot have an active wallet.");
  }

  const userPatch = pickDefined(patch, [
    "name", "role", "status", "riskLevel", "riskScore", "avatarUrl",
  ]);
  if (patch.email !== undefined) {
    userPatch.emailEncrypted = encryptData(normalizeEmail(patch.email));
    userPatch.emailLookup = createLookupHash(normalizeEmail(patch.email));
  }
  if (patch.phone !== undefined) {
    userPatch.phoneEncrypted = encryptData(normalizePhone(patch.phone));
    userPatch.phoneLookup = createLookupHash(normalizePhone(patch.phone));
  }
  if (patch.status === "suspended" || patch.status === "active") {
    userPatch.accountStatus = patch.status;
  }

  const tasks: Array<Promise<unknown>> = [];
  if (Object.keys(userPatch).length) {
    tasks.push(UserModel.findByIdAndUpdate(objectId, {
      $set: userPatch,
      ...(patch.status === "suspended" ? { $inc: { authVersion: 1 } } : {}),
    }, { returnDocument: "after", runValidators: true }).exec());
  }
  const requestedWalletStatus = patch.status === "suspended" ? "frozen" : patch.walletStatus;
  if (requestedWalletStatus) {
    const walletFilter = userReferenceFilter(WalletModel, objectId);
    const walletInsert = knownModelFields(WalletModel, {
      ...walletFilter,
      balance: 0,
      pendingBalance: 0,
      availableBalanceMinor: 0,
      currency: "BDT",
    });

    tasks.push(WalletModel.findOneAndUpdate(
      walletFilter,
      {
        $set: { status: databaseWalletStatus(WalletModel, requestedWalletStatus) },
        $setOnInsert: walletInsert,
      },
      { upsert: true, new: true, runValidators: true },
    ).exec());
  }

  await Promise.all(tasks);
  if (patch.status === "suspended") {
    await AuthSessionModel.updateMany(userReferenceFilter(AuthSessionModel, objectId),
      { $set: { revokedAt: new Date() } }).exec();
  }
  const after = await getAdminUserById(id);
  await writeAudit({ actorId, targetUserId: id, action: "admin.user.updated", before, after, reason: patch.reason });
  return after;
}

export async function softDeleteAdminUser(id: string, actorId?: string, reason = "Deleted by administrator") {
  const objectId = toObjectId(id);
  const before = await getAdminUserById(id);
  if (!before) throw new ServiceError(404, "User not found.");

  await Promise.all([
    UserModel.findByIdAndUpdate(objectId, {
      $set: { status: "suspended", accountStatus: "deleted", deletedAt: new Date() },
      $inc: { authVersion: 1 },
    }, { returnDocument: "after" }).exec(),
    WalletModel.findOneAndUpdate(
      userReferenceFilter(WalletModel, objectId),
      { $set: { status: databaseWalletStatus(WalletModel, "frozen") } },
      { new: true },
    ).exec(),
    AuthSessionModel.updateMany(
      userReferenceFilter(AuthSessionModel, objectId),
      { $set: { revokedAt: new Date() } },
    ).exec(),
  ]);

  await writeAudit({ actorId, targetUserId: id, action: "admin.user.deleted", before, reason });
}

export async function bulkUpdateAdminUsers(ids: string[], patch: Patch, actorId?: string) {
  const uniqueIds = [...new Set(ids)];
  await Promise.all(uniqueIds.map((id) => updateAdminUser(id, patch, actorId)));
  return { updated: uniqueIds.length };
}

export async function getUserTransactions(id: string, page: number, pageSize: number) {
  const user = await getAdminUserById(id);
  if (!user) throw new ServiceError(404, "User not found.");
  const userObjectId = toObjectId(id);
  const filter = { $or: [{ senderId: userObjectId }, { receiverId: userObjectId }] };
  const [documents, total] = await Promise.all([
    TransactionModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean().exec(),
    TransactionModel.countDocuments(filter).exec(),
  ]);
  const rows = documents as unknown as DbRecord[];
  const counterpartIds = [...new Set(rows.map((row) => String(
    String(row.senderId) === id ? row.receiverId : row.senderId,
  )))].filter((value) => Types.ObjectId.isValid(value));
  const counterpartUsers = await UserModel.find({ _id: { $in: counterpartIds } })
    .select("name").lean().exec() as unknown as DbRecord[];
  const names = new Map(counterpartUsers.map((row) => [recordId(row), stringValue(row.name)]));
  return { transactions: rows.map((row) => normalizeTransaction(row, id, names)), total, page, pageSize };
}

export async function getUserActivity(id: string, page: number, pageSize: number) {
  const objectId = toObjectId(id);
  const filter = { $or: [
    { targetUserId: objectId },
    { "metadata.targetUserId": id },
    { actor: objectId },
  ] };
  const [documents, total] = await Promise.all([
    AuditLogModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean().exec(),
    AuditLogModel.countDocuments(filter).exec(),
  ]);
  return {
    activities: (documents as unknown as DbRecord[]).map((document) => ({
      id: recordId(document),
      type: stringValue(document.type ?? document.category ?? "admin"),
      title: stringValue(document.title ?? document.action ?? "Account activity"),
      description: stringValue(document.description ?? (document.metadata as DbRecord | undefined)?.reason ?? "Account activity recorded."),
      createdAt: isoValue(document.createdAt),
      ipAddress: optionalString(document.ipAddress ?? document.ip),
    })),
    total, page, pageSize,
  };
}

export async function getUserManagementStats() {
  const result = await listAdminUsers({ page: 1, pageSize: Number.MAX_SAFE_INTEGER, sortField: "lastActive", sortDirection: "desc" });
  const users = result.users;
  const weekAgo = Date.now() - 604_800_000;
  return {
    totalUsers: result.total,
    verifiedUsers: users.filter((user) => user.role === "user" && user.kycStatus === "verified").length,
    activeUsers: users.filter((user) => user.status === "active").length,
    suspended: users.filter((user) => user.status === "suspended").length,
    pendingKyc: users.filter((user) => user.kycStatus === "under_review").length,
    highRisk: users.filter((user) => user.riskLevel === "high").length,
    newThisWeek: users.filter((user) => new Date(user.joinedAt).getTime() >= weekAgo).length,
  };
}

async function decorateUsers(users: DbRecord[]): Promise<AdminUserRecord[]> {
  const ids = users.map((user) => user._id).filter(Boolean);
  if (!ids.length) return [];
  const walletFilter = userReferenceManyFilter(WalletModel, ids);
  const sessionReference = userReferencePath(AuthSessionModel);
  const sessionFilter = userReferenceManyFilter(AuthSessionModel, ids);
  const securityUserIds = ids.map(String).filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
  const [wallets, ekycStatuses, sessionCounts, securityPreferences] = await Promise.all([
    WalletModel.find(walletFilter).lean().exec() as unknown as Promise<DbRecord[]>,
    currentEKYCStatuses(ids),
    AuthSessionModel.aggregate([
      { $match: { ...sessionFilter, revokedAt: { $in: [null, undefined] }, expiresAt: { $gt: new Date() } } },
      { $group: { _id: `$${sessionReference}`, count: { $sum: 1 } } },
    ]).exec() as unknown as Promise<Array<{ _id: unknown; count: number }>>,
    SecurityPreferences.find({ userId: { $in: securityUserIds } }).select("userId twoFactor.enabled").lean().exec(),
  ]);

  const walletByUser = indexByUser(wallets);
  const sessionsByUser = new Map(sessionCounts.map((item) => [String(item._id), item.count]));
  const twoFactorByUser = new Map(securityPreferences.map((item) => [String(item.userId), Boolean(item.twoFactor?.enabled)]));
  return users.map((user) => normalizeUser(
    user,
    walletByUser.get(recordId(user)),
    ekycStatuses.get(recordId(user)) ?? "not_started",
    sessionsByUser.get(recordId(user)) ?? numberValue(user.activeSessions),
    twoFactorByUser.get(recordId(user)) ?? false,
  ));
}

function normalizeUser(user: DbRecord, wallet?: DbRecord, kyc: KYCStatus = "not_started", activeSessions = 0, twoFactorEnabled = false): AdminUserRecord {
  const status = user.accountStatus === "suspended" ? "suspended" : normalizeStatus(user.status, user.isBlocked);
  const riskScore = clamp(numberValue(user.riskScore), 0, 100);
  return {
    id: recordId(user),
    name: stringValue(user.name ?? [user.firstName, user.lastName].filter(Boolean).join(" ") ?? "Unknown user"),
    email: decryptUserField(user.emailEncrypted, user.email),
    phone: decryptUserField(user.phoneEncrypted, user.phone),
    role: normalizeRole(user.role),
    status,
    kycStatus: kyc,
    walletStatus: kyc === "verified"
      ? normalizeWalletStatus(wallet?.status ?? user.walletStatus)
      : "restricted",
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
    twoFactorEnabled,
    failedLoginCount: numberValue(user.failedLoginCount),
    activeSessions,
    avatarUrl: optionalString(user.avatarUrl ?? user.profileImage ?? user.photoURL),
  };
}
async function writeAudit(entry: {
  actorId?: string;
  targetUserId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}) {
  if (!entry.actorId) {
    throw new ServiceError(
      401,
      "Authenticated administrator identity is missing.",
    );
  }

  const actor = Types.ObjectId.isValid(entry.actorId)
    ? new Types.ObjectId(entry.actorId)
    : entry.actorId;

  const targetUser = Types.ObjectId.isValid(entry.targetUserId)
    ? new Types.ObjectId(entry.targetUserId)
    : entry.targetUserId;

  const auditDocument = knownModelFields(AuditLogModel, {
    actor,
    targetUserId: targetUser,
    action: entry.action,
    metadata: {
      targetUserId: entry.targetUserId,
      reason: entry.reason,
      before: auditSnapshot(entry.before),
      after: auditSnapshot(entry.after),
    },
  });

  await AuditLogModel.create(auditDocument);
}

function indexByUser(records: DbRecord[]) {
  const result = new Map<string, DbRecord>();
  records.forEach((record) => {
    const key = String(record.userId ?? record.user ?? "");
    if (key) result.set(key, record);
  });
  return result;
}

function normalizeTransaction(transaction: DbRecord, userId: string, names: Map<string, string>) {
  let amount: number;
  try {
    const minor = Number(decryptData(transaction.amountEncrypted as EncryptedData));
    if (!Number.isSafeInteger(minor) || minor < 0) throw new Error("Invalid amount");
    amount = minor / 100;
  } catch {
    throw new ServiceError(503, "Transaction history is unavailable because a stored amount cannot be decrypted.");
  }
  const sender = String(transaction.senderId);
  const counterpartId = sender === userId ? String(transaction.receiverId) : sender;
  const kind = stringValue(transaction.type).toUpperCase();
  return {
    id: recordId(transaction),
    type: kind === "DEPOSIT" ? "cash_in" : kind === "WITHDRAW" ? "cash_out" : sender === userId ? "send" : "receive",
    amount,
    status: stringValue(transaction.status ?? "PENDING").toLowerCase(),
    counterparty: names.get(counterpartId) ?? "Wallet transaction",
    createdAt: isoValue(transaction.createdAt),
  };
}

function sortableValue(user: AdminUserRecord, field: UserListQuery["sortField"]): string | number {
  if (field === "riskScore") return user.riskScore;
  if (field === "lastActive" || field === "joinedAt") return new Date(user[field]).getTime();
  if (field === "createdAt") return new Date(user.joinedAt).getTime();
  return user[field as keyof AdminUserRecord] as string | number;
}

function toObjectId(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ServiceError(400, "Invalid user id.");
  return new Types.ObjectId(id);
}

function recordId(record: DbRecord) { return String(record._id ?? record.id ?? ""); }
function stringValue(value: unknown) { return typeof value === "string" ? value : value == null ? "" : String(value); }
function optionalString(value: unknown) { const result = stringValue(value); return result || undefined; }
function numberValue(value: unknown) { const result = Number(value ?? 0); return Number.isFinite(result) ? result : 0; }
function moneyFromFields(record: DbRecord | undefined, majorFields: string[], minorFields: string[]) {
  if (!record) return 0;
  for (const field of majorFields) {
    if (record[field] != null) return numberValue(record[field]);
  }
  for (const field of minorFields) {
    if (record[field] != null) return numberValue(record[field]) / 100;
  }
  return 0;
}
function isoValue(value: unknown) { const date = value ? new Date(value as string | number | Date) : new Date(0); return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString(); }
function clamp(value: number, minimum: number, maximum: number) { return Math.min(maximum, Math.max(minimum, value)); }

function normalizeRole(value: unknown): UserRole {
  const role = stringValue(value).toLowerCase();
  if (role === "administrator") return "admin";
  return ["admin", "super_admin", "support", "analyst", "merchant"].includes(role) ? role as UserRole : "user";
}

function decryptUserField(encrypted: unknown, legacy: unknown): string {
  if (!encrypted) return stringValue(legacy);
  try {
    return decryptData(encrypted as EncryptedData);
  } catch {
    throw new ServiceError(503, "User details are unavailable because a stored contact field cannot be decrypted.");
  }
}

function auditSnapshot(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Partial<AdminUserRecord>;
  return { role: record.role, status: record.status, kycStatus: record.kycStatus,
    walletStatus: record.walletStatus, riskLevel: record.riskLevel, riskScore: record.riskScore };
}
function normalizeStatus(value: unknown, blocked: unknown): UserStatus {
  if (blocked === true) return "suspended";
  const status = stringValue(value).toLowerCase();
  if (["blocked", "disabled", "inactive"].includes(status)) return "suspended";
  return ["active", "suspended", "restricted", "pending"].includes(status) ? status as UserStatus : "active";
}
function normalizeWalletStatus(value: unknown): WalletStatus {
  const status = stringValue(value).toLowerCase();
  if (status === "pending_kyc") return "restricted";
  if (["locked", "blocked"].includes(status)) return "frozen";
  if (["disabled", "inactive"].includes(status)) return "closed";
  return ["active", "frozen", "restricted", "closed"].includes(status) ? status as WalletStatus : "active";
}
function normalizeRiskLevel(value: unknown, score: number): RiskLevel {
  const level = stringValue(value).toLowerCase();
  if (level === "critical") return "high";
  if (["low", "medium", "high"].includes(level)) return level as RiskLevel;
  return score >= 70 ? "high" : score >= 40 ? "medium" : "low";
}
function pickDefined(source: Patch, keys: Array<keyof Patch>) {
  const result: Record<string, unknown> = {};
  keys.forEach((key) => { if (source[key] !== undefined) result[String(key)] = source[key]; });
  return result;
}

type DbModel = Model<DbRecord>;

function userReferencePath(model: DbModel): "userId" | "user" {
  if (model.schema.path("userId")) return "userId";
  if (model.schema.path("user")) return "user";

  throw new ServiceError(
    500,
    `${model.modelName} must define either a userId or user reference.`,
  );
}

function userReferenceFilter(model: DbModel, userId: unknown): Record<string, unknown> {
  return { [userReferencePath(model)]: userId };
}

function userReferenceManyFilter(model: DbModel, userIds: unknown[]): Record<string, unknown> {
  return { [userReferencePath(model)]: { $in: userIds } };
}

function knownModelFields(
  model: DbModel,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && model.schema.path(key)) {
      result[key] = value;
    }
  }

  return result;
}

function schemaEnumValues(model: DbModel, path: string): string[] {
  const schemaType = model.schema.path(path) as unknown as {
    enumValues?: unknown[];
  } | undefined;

  return (schemaType?.enumValues ?? []).map(String);
}

function pickSupportedStatus(
  model: DbModel,
  requested: string,
  aliases: Record<string, string[]>,
): string {
  const allowed = schemaEnumValues(model, "status");
  const candidates = [
    requested,
    requested.toLowerCase(),
    requested.toUpperCase(),
    ...(aliases[requested] ?? []),
  ];

  if (!allowed.length) return candidates[0]!;

  const match = candidates.find((candidate) => allowed.includes(candidate));
  if (match) return match;

  throw new ServiceError(
    400,
    `${requested} cannot be represented by the ${model.modelName} status schema.`,
  );
}

function databaseWalletStatus(model: DbModel, status: WalletStatus): string {
  return pickSupportedStatus(model, status, {
    active: ["ACTIVE"],
    frozen: ["FROZEN", "BLOCKED"],
    restricted: ["BLOCKED", "FROZEN"],
    closed: ["BLOCKED"],
  });
}


export class ServiceError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = "ServiceError";
  }
}
