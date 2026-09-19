import {
  AuthSession,
} from "../../../models/AuthSession.js";
import {
  PasskeyCredential,
} from "../../../models/PasskeyCredential.js";
import {
  SecurityPreferences,
} from "../../../models/SecurityPreferences.js";
import {
  User,
} from "../../../models/User.js";
import {
  safeIso,
} from "./adminSecurityQueryUtils.js";
import type {
  AdminIdentityRiskItem,
  AdminSecurityRisk,
} from "./adminSecurityTypes.js";

interface UserRow {
  _id: unknown;
  name: string;
  role: string;
  emailVerified: boolean;
  passwordChangedAt?: Date;
  createdAt: Date;
}

function calculateRisk(reasons: string[]): AdminSecurityRisk {
  if (reasons.length >= 3) return "high";
  if (reasons.length >= 2) return "medium";
  return "low";
}

export async function queryAdminIdentityRisk(input: {
  page: number;
  limit: number;
  risk?: string;
  search?: string;
}) {
  const now = new Date();
  const users = await User.find({ accountStatus: "active" })
    .select("name role emailVerified passwordChangedAt createdAt")
    .sort({ createdAt: -1 })
    .limit(2000)
    .lean();
  const userIds = users.map((user) => user._id);

  const [preferences, passkeyIds, sessionRows] = await Promise.all([
    SecurityPreferences.find({ userId: { $in: userIds } })
      .select("userId twoFactor.enabled")
      .lean(),
    PasskeyCredential.distinct("userId", {
      userId: { $in: userIds },
      revokedAt: { $exists: false },
    }),
    AuthSession.aggregate<{ _id: unknown; count: number }>([
      {
        $match: {
          userId: { $in: userIds },
          revokedAt: { $exists: false },
          expiresAt: { $gt: now },
        },
      },
      { $group: { _id: "$userId", count: { $sum: 1 } } },
    ]),
  ]);

  const mfaByUser = new Map(
    preferences.map((item) => [String(item.userId), Boolean(item.twoFactor?.enabled)])
  );
  const passkeyUsers = new Set(passkeyIds.map(String));
  const sessionsByUser = new Map(sessionRows.map((item) => [String(item._id), item.count]));
  const passwordAgeLimit = 180 * 24 * 60 * 60 * 1000;

  const items: AdminIdentityRiskItem[] = (users as unknown as UserRow[]).map((user) => {
    const id = String(user._id);
    const mfaEnabled = mfaByUser.get(id) || false;
    const passkeyEnabled = passkeyUsers.has(id);
    const activeSessions = sessionsByUser.get(id) || 0;
    const reasons: string[] = [];

    if (!user.emailVerified) reasons.push("Email is not verified");
    if (!mfaEnabled) reasons.push("Multi-factor authentication is disabled");
    if (!passkeyEnabled) reasons.push("No active passkey is registered");
    if (!user.passwordChangedAt) {
      reasons.push("Password rotation date is unavailable");
    } else if (now.getTime() - user.passwordChangedAt.getTime() > passwordAgeLimit) {
      reasons.push("Password is older than 180 days");
    }
    if (activeSessions >= 6) reasons.push("Unusually high active session count");

    return {
      id,
      name: user.name?.trim() || "Platform user",
      role: user.role || "user",
      emailVerified: Boolean(user.emailVerified),
      mfaEnabled,
      passkeyEnabled,
      activeSessions,
      passwordChangedAt: user.passwordChangedAt ? safeIso(user.passwordChangedAt) : null,
      risk: calculateRisk(reasons),
      riskReasons: reasons,
      createdAt: safeIso(user.createdAt),
    };
  });

  const search = input.search?.trim().toLowerCase() || "";
  const requestedRisk = ["low", "medium", "high"].includes(input.risk || "")
    ? input.risk
    : "";
  const filtered = items
    .filter((item) => !requestedRisk || item.risk === requestedRisk)
    .filter((item) => !search || item.name.toLowerCase().includes(search) || item.role.toLowerCase().includes(search));
  const total = filtered.length;
  const start = (input.page - 1) * input.limit;

  return {
    identities: filtered.slice(start, start + input.limit),
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.limit)),
    },
  };
}
