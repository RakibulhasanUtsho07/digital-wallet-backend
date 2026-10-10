import {
  AuthSession,
} from "../../../models/AuthSession.js";
import {
  safeIso,
} from "./adminSecurityQueryUtils.js";
import type {
  AdminSecurityRisk,
  AdminSecuritySessionItem,
} from "./adminSecurityTypes.js";

interface PopulatedUser {
  _id: unknown;
  name?: string;
  role?: string;
}

interface SessionRow {
  _id: unknown;
  userId?: PopulatedUser | unknown;
  device: string;
  browser: string;
  os: string;
  location: string;
  maskedIp: string;
  lastActiveAt: Date;
  expiresAt: Date;
  createdAt: Date;
}

function isPopulatedUser(value: unknown): value is PopulatedUser {
  return Boolean(value && typeof value === "object" && "_id" in value);
}

function getRisk(lastActiveAt: Date, sessionCount: number): AdminSecurityRisk {
  if (sessionCount >= 6) return "high";
  if (sessionCount >= 3 || Date.now() - lastActiveAt.getTime() > 24 * 60 * 60 * 1000) {
    return "medium";
  }
  return "low";
}

export async function queryAdminSecuritySessions(input: {
  page: number;
  limit: number;
  risk?: string;
  search?: string;
}) {
  const now = new Date();
  const rows = await AuthSession.find({
    revokedAt: { $exists: false },
    expiresAt: { $gt: now },
  })
    .select("userId device browser os location maskedIp lastActiveAt expiresAt createdAt")
    .populate("userId", "name role")
    .sort({ lastActiveAt: -1 })
    .limit(2000)
    .lean();

  const sessionCounts = new Map<string, number>();
  for (const row of rows as unknown as SessionRow[]) {
    const id = isPopulatedUser(row.userId) ? String(row.userId._id) : "unknown";
    sessionCounts.set(id, (sessionCounts.get(id) || 0) + 1);
  }

  const search = input.search?.trim().toLowerCase() || "";
  const requestedRisk = ["low", "medium", "high"].includes(input.risk || "")
    ? input.risk
    : "";

  const sessions: AdminSecuritySessionItem[] = (rows as unknown as SessionRow[])
    .map((row) => {
      const user = isPopulatedUser(row.userId)
        ? {
            id: String(row.userId._id),
            name: row.userId.name?.trim() || "Platform user",
            role: row.userId.role || "user",
          }
        : null;
      const risk = getRisk(row.lastActiveAt, sessionCounts.get(user?.id || "unknown") || 1);
      return {
        id: String(row._id),
        user,
        device: row.device || "Unknown device",
        browser: row.browser || "Unknown browser",
        os: row.os || "Unknown OS",
        location: row.location || "Unknown location",
        maskedIp: row.maskedIp || "Unknown",
        risk,
        lastActiveAt: safeIso(row.lastActiveAt),
        expiresAt: safeIso(row.expiresAt),
        createdAt: safeIso(row.createdAt),
      };
    })
    .filter((row) => !requestedRisk || row.risk === requestedRisk)
    .filter((row) => {
      if (!search) return true;
      return [
        row.user?.name,
        row.user?.role,
        row.device,
        row.browser,
        row.os,
        row.location,
        row.maskedIp,
      ].some((value) => value?.toLowerCase().includes(search));
    });

  const total = sessions.length;
  const start = (input.page - 1) * input.limit;

  return {
    sessions: sessions.slice(start, start + input.limit),
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.limit)),
    },
  };
}
