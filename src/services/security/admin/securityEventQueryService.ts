import {
  SecurityEvent,
} from "../../../models/SecurityEvent.js";
import {
  escapeRegex,
  safeIso,
} from "./adminSecurityQueryUtils.js";
import type {
  AdminSecurityEventItem,
} from "./adminSecurityTypes.js";

interface PopulatedUser {
  _id: unknown;
  name?: string;
  role?: string;
}

interface PopulatedEvent {
  _id: unknown;
  userId?: PopulatedUser | unknown;
  eventType: string;
  title: string;
  status: "success" | "warning" | "info";
  detail?: string;
  device?: string;
  location?: string;
  maskedIp?: string;
  createdAt: Date;
}

function isPopulatedUser(value: unknown): value is PopulatedUser {
  return Boolean(value && typeof value === "object" && "_id" in value);
}

function serializeEvent(row: PopulatedEvent): AdminSecurityEventItem {
  const user = isPopulatedUser(row.userId)
    ? {
        id: String(row.userId._id),
        name: row.userId.name?.trim() || "Platform user",
        role: row.userId.role || "user",
      }
    : null;

  return {
    id: String(row._id),
    user,
    eventType: row.eventType,
    title: row.title,
    status: row.status,
    detail: row.detail || "No additional event detail.",
    device: row.device || "Unknown device",
    location: row.location || "Unknown location",
    maskedIp: row.maskedIp || "Unknown",
    sessionId: null,
    createdAt: safeIso(row.createdAt),
  };
}

export async function queryAdminSecurityEvents(input: {
  page: number;
  limit: number;
  status?: string;
  eventType?: string;
  search?: string;
}) {
  const filter: Record<string, unknown> = {};

  if (["success", "warning", "info"].includes(input.status || "")) {
    filter.status = input.status;
  }

  if (input.eventType?.trim()) {
    filter.eventType = input.eventType.trim().toUpperCase();
  }

  if (input.search?.trim()) {
    const regex = new RegExp(escapeRegex(input.search.trim()), "i");
    filter.$or = [
      { title: regex },
      { detail: regex },
      { device: regex },
      { location: regex },
      { maskedIp: regex },
    ];
  }

  const skip = (input.page - 1) * input.limit;
  const [total, rows] = await Promise.all([
    SecurityEvent.countDocuments(filter),
    SecurityEvent.find(filter)
      .select("userId eventType title status detail device location maskedIp createdAt")
      .populate("userId", "name role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(input.limit)
      .lean(),
  ]);

  return {
    events: (rows as unknown as PopulatedEvent[]).map(serializeEvent),
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.limit)),
    },
  };
}
