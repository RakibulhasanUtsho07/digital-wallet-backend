import { Types } from "mongoose";
import { EKYCVerification } from "../modules/ekyc/models/EKYCVerification.js";
import { User } from "../models/User.js";
import { Wallet } from "../models/Wallet.js";
import { WalletSecurityLock } from "../models/WalletSecurityLock.js";
import { MerchantVerification } from "../models/MerchantVerification.js";
import type { KYCStatus } from "../types/userManagement.js";
import type { EKYCStatus } from "../modules/ekyc/types.js";

export function statusFromEKYC(status: EKYCStatus | null | undefined): KYCStatus {
  switch (status) {
    case "VERIFIED": return "verified";
    case "REJECTED": return "rejected";
    case "PENDING_MANUAL_REVIEW": return "under_review";
    case "QUEUED":
    case "PROCESSING": return "pending";
    default: return "not_started";
  }
}

// The newest attempt is authoritative. Never fall back to the legacy KYC row
// or the (eventually consistent) User.kycStatus projection.
export async function currentEKYCStatus(userId: string): Promise<KYCStatus> {
  const attempt = await EKYCVerification.findOne({ userId })
    .sort({ submittedAt: -1, createdAt: -1, _id: -1 })
    .select("status")
    .lean();
  return statusFromEKYC(attempt?.status);
}

export async function currentEKYCStatuses(ids: unknown[]): Promise<Map<string, KYCStatus>> {
  const objectIds = ids.map((id) => String(id)).filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
  if (!objectIds.length) return new Map();
  const attempts = await EKYCVerification.aggregate<{ _id: Types.ObjectId; status: EKYCStatus }>([
    { $match: { userId: { $in: objectIds } } },
    { $sort: { submittedAt: -1, createdAt: -1, _id: -1 } },
    { $group: { _id: "$userId", status: { $first: "$status" } } },
  ]);
  const statuses = new Map<string, KYCStatus>();
  for (const attempt of attempts) {
    statuses.set(String(attempt._id), statusFromEKYC(attempt.status));
  }
  return statuses;
}

export async function countVerifiedPersonalUsers(): Promise<number> {
  const rows = await EKYCVerification.aggregate<{ total: number }>([
    { $sort: { submittedAt: -1, createdAt: -1, _id: -1 } },
    { $group: { _id: "$userId", status: { $first: "$status" } } },
    { $match: { status: "VERIFIED" } },
    { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "owner" } },
    { $unwind: "$owner" },
    { $match: { "owner.role": "user", "owner.accountStatus": { $ne: "deleted" }, "owner.deletedAt": null } },
    { $count: "total" },
  ]);
  return rows[0]?.total ?? 0;
}

export async function countVerifiedBusinesses(): Promise<number> {
  const rows = await MerchantVerification.aggregate<{ total: number }>([
    { $match: { status: "verified", "documents.0": { $exists: true } } },
    { $lookup: { from: "merchants", localField: "merchantId", foreignField: "_id", as: "merchant" } },
    { $unwind: "$merchant" },
    { $match: { "merchant.verificationStatus": "verified" } },
    { $lookup: { from: "users", localField: "ownerId", foreignField: "_id", as: "owner" } },
    { $unwind: "$owner" },
    { $match: { "owner.accountStatus": { $ne: "deleted" }, "owner.deletedAt": null } },
    { $lookup: { from: "ekycverifications", let: { ownerId: "$ownerId" }, pipeline: [
      { $match: { $expr: { $eq: ["$userId", "$$ownerId"] } } },
      { $sort: { submittedAt: -1, createdAt: -1, _id: -1 } }, { $limit: 1 },
    ], as: "identity" } },
    { $unwind: "$identity" },
    { $match: { "identity.status": "VERIFIED" } },
    { $group: { _id: "$merchantId" } },
    { $count: "total" },
  ]);
  return rows[0]?.total ?? 0;
}

// One-time-per-process repair for wallets that were created ACTIVE by the old
// registration flow. It is idempotent and only reduces permissions.
export async function reconcileLegacyActiveWallets(): Promise<void> {
  const verifiedOwners = await EKYCVerification.aggregate<{ _id: Types.ObjectId }>([
    { $sort: { submittedAt: -1, createdAt: -1, _id: -1 } },
    { $group: { _id: "$userId", status: { $first: "$status" } } },
    { $match: { status: "VERIFIED" } },
    { $project: { _id: 1 } },
  ]);
  await Wallet.updateMany(
    { status: { $in: ["ACTIVE", "active"] }, userId: { $nin: verifiedOwners.map((row) => row._id) } },
    { $set: { status: "PENDING_KYC" } },
  );
}

// Security/admin freezes remain independent of identity verification. A wallet
// awaiting identity verification can only be enabled by a verified e-KYC result.
export async function syncWalletWithEKYC(userId: string, status?: KYCStatus): Promise<KYCStatus> {
  const identity = status ?? await currentEKYCStatus(userId);
  if (identity !== "verified") {
    await Wallet.updateOne(
      { userId, status: { $in: ["ACTIVE", "active"] } },
      { $set: { status: "PENDING_KYC" } },
    );
    return identity;
  }

  const [user, lock] = await Promise.all([
    User.findById(userId).select("accountStatus deletedAt").lean(),
    WalletSecurityLock.findOne({ userId }).select("frozen").lean(),
  ]);
  if (user && user.accountStatus !== "deleted" && !user.deletedAt && !lock?.frozen) {
    await Wallet.updateOne(
      { userId, status: "PENDING_KYC" },
      { $set: { status: "ACTIVE" } },
    );
  }
  return identity;
}
