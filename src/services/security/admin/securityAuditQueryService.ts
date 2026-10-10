import {
  AuditLog,
} from "../../../models/AuditLog.js";
import {
  escapeRegex,
  maskAuditIp,
  safeIso,
  summarizeMetadata,
} from "./adminSecurityQueryUtils.js";
import type {
  AdminSecurityAuditItem,
} from "./adminSecurityTypes.js";

interface PopulatedActor {
  _id: unknown;
  name?: string;
  role?: string;
}

interface AuditRow {
  _id: unknown;
  actor?: PopulatedActor | unknown;
  action: string;
  resource?: string;
  metadata?: unknown;
  ipAddress?: string;
  createdAt: Date;
}

function isPopulatedActor(value: unknown): value is PopulatedActor {
  return Boolean(value && typeof value === "object" && "_id" in value);
}

export async function queryAdminSecurityAudit(input: {
  page: number;
  limit: number;
  search?: string;
}) {
  const filter: Record<string, unknown> = {};
  if (input.search?.trim()) {
    const regex = new RegExp(escapeRegex(input.search.trim()), "i");
    filter.$or = [{ action: regex }, { resource: regex }];
  }

  const skip = (input.page - 1) * input.limit;
  const [total, rows] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter)
      .select("actor action resource metadata ipAddress createdAt")
      .populate("actor", "name role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(input.limit)
      .lean(),
  ]);

  const audit: AdminSecurityAuditItem[] = (rows as unknown as AuditRow[]).map((row) => ({
    id: String(row._id),
    actor: isPopulatedActor(row.actor)
      ? {
          id: String(row.actor._id),
          name: row.actor.name?.trim() || "Platform operator",
          role: row.actor.role || "user",
        }
      : null,
    action: row.action,
    resource: row.resource || "Platform",
    maskedIp: maskAuditIp(row.ipAddress),
    metadataSummary: summarizeMetadata(row.metadata),
    createdAt: safeIso(row.createdAt),
  }));

  return {
    audit,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.limit)),
    },
  };
}
