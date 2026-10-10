import {
  AuthSession,
} from "../../../models/AuthSession.js";
import {
  PasskeyCredential,
} from "../../../models/PasskeyCredential.js";
import {
  SecurityEvent,
} from "../../../models/SecurityEvent.js";
import {
  SecurityPreferences,
} from "../../../models/SecurityPreferences.js";
import {
  SystemLog,
} from "../../../models/SystemLog.js";
import {
  User,
} from "../../../models/User.js";
import {
  getOrCreatePlatformSettings,
  settingsToDTO,
} from "../../platformSettingsService.js";
import { safeIso, SECURITY_RANGES } from "./adminSecurityQueryUtils.js";

import type {
  AdminSecurityEventItem,
  AdminSecurityPosture,
  AdminSecurityRange,
  AdminSecurityServiceHealth,
  AdminSecurityTimelinePoint,
} from "./adminSecurityTypes.js";

interface TimelineBucket {
  _id: string;
  total: number;
  successfulLogins: number;
  failedLogins: number;
  suspiciousLogins: number;
}

interface ServiceBucket {
  _id: string;
  totalEvents: number;
  failures: number;
  criticalEvents: number;
  lastEventAt: Date | null;
}

interface PopulatedUser {
  _id: unknown;
  name?: string;
  role?: string;
}

interface PopulatedSecurityEvent {
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

const KNOWN_SERVICES = [
  "API",
  "Authentication",
  "Database",
  "Wallet",
  "Transactions",
  "Transfers",
  "KYC",
  "Notifications",
  "Cloudinary",
  "AI",
  "Background Jobs",
  "System",
  "Security",
  "Support",
  "Revenue",
] as const;

function isPopulatedUser(
  value: unknown
): value is PopulatedUser {
  return Boolean(
    value &&
      typeof value === "object" &&
      "_id" in value
  );
}

function serializeEvent(
  row: PopulatedSecurityEvent
): AdminSecurityEventItem {
  const user = isPopulatedUser(row.userId)
    ? {
        id: String(row.userId._id),
        name:
          typeof row.userId.name === "string" &&
          row.userId.name.trim()
            ? row.userId.name.trim()
            : "Platform user",
        role:
          typeof row.userId.role === "string"
            ? row.userId.role
            : "user",
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

function bucketKey(
  date: Date,
  hourly: boolean
): string {
  const iso = date.toISOString();
  return hourly
    ? `${iso.slice(0, 13)}:00:00.000Z`
    : `${iso.slice(0, 10)}T00:00:00.000Z`;
}

function buildTimeline(
  range: AdminSecurityRange,
  start: Date,
  now: Date,
  rows: TimelineBucket[]
): AdminSecurityTimelinePoint[] {
  const hourly = range === "24h";
  const byBucket = new Map(
    rows.map((row) => [row._id, row])
  );
  const points: AdminSecurityTimelinePoint[] = [];
  const cursor = new Date(start);

  if (hourly) {
    cursor.setUTCMinutes(0, 0, 0);
  } else {
    cursor.setUTCHours(0, 0, 0, 0);
  }

  while (cursor.getTime() <= now.getTime()) {
    const key = bucketKey(cursor, hourly);
    const row = byBucket.get(key);

    points.push({
      timestamp: key,
      label: new Intl.DateTimeFormat(
        "en-GB",
        hourly
          ? {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "UTC",
            }
          : {
              day: "2-digit",
              month: "short",
              timeZone: "UTC",
            }
      ).format(cursor),
      total: row?.total ?? 0,
      successfulLogins: row?.successfulLogins ?? 0,
      failedLogins: row?.failedLogins ?? 0,
      suspiciousLogins: row?.suspiciousLogins ?? 0,
    });

    if (hourly) {
      cursor.setUTCHours(cursor.getUTCHours() + 1);
    } else {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  return points;
}

function normalizeServiceHealth(
  rows: ServiceBucket[]
): AdminSecurityServiceHealth[] {
  const byService = new Map(
    rows.map((row) => [row._id, row])
  );

  return KNOWN_SERVICES.map((service) => {
    const row = byService.get(service);

    if (!row) {
      return {
        service,
        status: "unknown" as const,
        totalEvents: 0,
        failures: 0,
        criticalEvents: 0,
        failureRate: 0,
        lastEventAt: null,
      };
    }

    const failureRate =
      row.totalEvents > 0
        ? row.failures / row.totalEvents
        : 0;
    const status =
      row.criticalEvents > 0 || failureRate >= 0.35
        ? "critical"
        : failureRate >= 0.1
          ? "attention"
          : "healthy";

    return {
      service,
      status,
      totalEvents: row.totalEvents,
      failures: row.failures,
      criticalEvents: row.criticalEvents,
      failureRate:
        Math.round(failureRate * 1000) / 10,
      lastEventAt: row.lastEventAt
        ? safeIso(row.lastEventAt)
        : null,
    };
  });
}

export async function getAdminSecurityOverview(
  range: AdminSecurityRange
) {
  const now = new Date();
  const start = new Date(
    now.getTime() - SECURITY_RANGES[range]
  );
  const healthStart = new Date(
    now.getTime() - 24 * 60 * 60 * 1000
  );
  const dateFormat =
    range === "24h"
      ? "%Y-%m-%dT%H:00:00.000Z"
      : "%Y-%m-%dT00:00:00.000Z";

  const [
    activeUsers,
    mfaUsers,
    passkeyUserIds,
    activeSessions,
    failedLogins,
    suspiciousLogins,
    criticalSystemEvents,
    warningEvents,
    timelineRows,
    serviceRows,
    recentRows,
    settings,
  ] = await Promise.all([
    User.countDocuments({ accountStatus: "active" }),
    SecurityPreferences.countDocuments({
      "twoFactor.enabled": true,
    }),
    PasskeyCredential.distinct("userId", {
      revokedAt: { $exists: false },
    }),
    AuthSession.countDocuments({
      revokedAt: { $exists: false },
      expiresAt: { $gt: now },
    }),
    SecurityEvent.countDocuments({
      eventType: "LOGIN_FAILED",
      createdAt: { $gte: start },
    }),
    SecurityEvent.countDocuments({
      eventType: "SUSPICIOUS_LOGIN",
      createdAt: { $gte: start },
    }),
    SystemLog.countDocuments({
      timestamp: { $gte: start },
      level: "CRITICAL",
    }),
    SecurityEvent.countDocuments({
      status: "warning",
      createdAt: { $gte: start },
    }),
    SecurityEvent.aggregate<TimelineBucket>([
      { $match: { createdAt: { $gte: start } } },
      {
        $group: {
          _id: {
            $dateToString: {
              date: "$createdAt",
              format: dateFormat,
              timezone: "UTC",
            },
          },
          total: { $sum: 1 },
          successfulLogins: {
            $sum: {
              $cond: [
                { $eq: ["$eventType", "LOGIN_SUCCESS"] },
                1,
                0,
              ],
            },
          },
          failedLogins: {
            $sum: {
              $cond: [
                { $eq: ["$eventType", "LOGIN_FAILED"] },
                1,
                0,
              ],
            },
          },
          suspiciousLogins: {
            $sum: {
              $cond: [
                { $eq: ["$eventType", "SUSPICIOUS_LOGIN"] },
                1,
                0,
              ],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    SystemLog.aggregate<ServiceBucket>([
      { $match: { timestamp: { $gte: healthStart } } },
      {
        $group: {
          _id: "$service",
          totalEvents: { $sum: 1 },
          failures: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ["$result", "Failed"] },
                    { $eq: ["$result", "Timeout"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          criticalEvents: {
            $sum: {
              $cond: [
                { $eq: ["$level", "CRITICAL"] },
                1,
                0,
              ],
            },
          },
          lastEventAt: { $max: "$timestamp" },
        },
      },
    ]),
    SecurityEvent.find({ createdAt: { $gte: start } })
      .populate("userId", "name role")
      .sort({ createdAt: -1 })
      .limit(8)
      .lean(),
    getOrCreatePlatformSettings(),
  ]);

  const safeActiveUsers = Math.max(activeUsers, 0);
  const safeMfaUsers = Math.min(mfaUsers, safeActiveUsers);
  const safePasskeyUsers = Math.min(
    passkeyUserIds.length,
    safeActiveUsers
  );
  const mfaCoverage =
    safeActiveUsers > 0
      ? (safeMfaUsers / safeActiveUsers) * 100
      : 0;
  const passkeyCoverage =
    safeActiveUsers > 0
      ? (safePasskeyUsers / safeActiveUsers) * 100
      : 0;
  const policy = settingsToDTO(settings);

  let score = 100;
  score -= Math.min(25, suspiciousLogins * 5);
  score -= Math.min(20, criticalSystemEvents * 4);
  score -= Math.min(15, Math.floor(failedLogins / 5));
  score -= Math.round(
    Math.max(0, 80 - mfaCoverage) * 0.25
  );
  if (!policy.security.requireMfa) score -= 10;
  if (!policy.security.requireReauthForSensitiveActions) score -= 10;
  score = Math.max(0, Math.min(100, score));

  const posture: AdminSecurityPosture =
    score >= 80
      ? "healthy"
      : score >= 60
        ? "attention"
        : "critical";

  return {
    generatedAt: now.toISOString(),
    range,
    posture: {
      score,
      status: posture,
      label:
        posture === "healthy"
          ? "Protected"
          : posture === "attention"
            ? "Needs attention"
            : "Critical review",
    },
    metrics: {
      activeUsers: safeActiveUsers,
      activeSessions,
      failedLogins,
      suspiciousLogins,
      criticalSystemEvents,
      warningEvents,
      mfaUsers: safeMfaUsers,
      mfaCoverage:
        Math.round(mfaCoverage * 10) / 10,
      passkeyUsers: safePasskeyUsers,
      passkeyCoverage:
        Math.round(passkeyCoverage * 10) / 10,
    },
    distribution: {
      successful:
        timelineRows.reduce(
          (total, item) => total + item.successfulLogins,
          0
        ),
      failed: failedLogins,
      suspicious: suspiciousLogins,
      warning: warningEvents,
      critical: criticalSystemEvents,
    },
    timeline: buildTimeline(
      range,
      start,
      now,
      timelineRows
    ),
    services: normalizeServiceHealth(serviceRows),
    recentEvents: (
      recentRows as unknown as PopulatedSecurityEvent[]
    ).map(serializeEvent),
    policies: {
      ...policy.security,
      revision: settings.revision,
      updatedAt: safeIso(settings.updatedAt),
    },
  };
}
