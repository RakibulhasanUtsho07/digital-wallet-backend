import { User } from "../../../models/User.js";
import type { EKYCStatus } from "../types.js";

type UserKYCStatus = "not_started" | "pending" | "verified" | "rejected";

export function toUserKYCStatus(status: EKYCStatus): UserKYCStatus {
  if (status === "VERIFIED") return "verified";
  if (status === "REJECTED") return "rejected";
  return "pending";
}

export async function projectEKYCStatusToUser(userId: string, status: EKYCStatus): Promise<void> {
  const result = await User.updateOne(
    { _id: userId, accountStatus: { $ne: "deleted" } },
    { $set: { kycStatus: toUserKYCStatus(status) } }
  );
  if (result.matchedCount !== 1) {
    throw new Error("Unable to synchronize the e-KYC status to the user account.");
  }
}

export type EKYCStatusProjector = typeof projectEKYCStatusToUser;
