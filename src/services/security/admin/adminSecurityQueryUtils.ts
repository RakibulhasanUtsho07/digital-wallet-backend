import type {
  AdminSecurityRange,
} from "./adminSecurityTypes.js";

export const SECURITY_RANGES:
  Record<AdminSecurityRange, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
};

export function parseSecurityRange(
  value: unknown
): AdminSecurityRange {
  return value === "24h" ||
    value === "7d" ||
    value === "30d" ||
    value === "90d"
    ? value
    : "7d";
}

export function parsePositiveInteger(
  value: unknown,
  fallback: number,
  maximum: number
): number {
  const parsed = Number(value);

  return Number.isInteger(parsed) &&
    parsed > 0
    ? Math.min(parsed, maximum)
    : fallback;
}

export function escapeRegex(
  value: string
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

export function safeIso(
  value: unknown
): string {
  const date = new Date(
    value as string | number | Date
  );

  return Number.isNaN(date.getTime())
    ? new Date(0).toISOString()
    : date.toISOString();
}

export function maskAuditIp(
  value: unknown
): string {
  if (typeof value !== "string") {
    return "Unknown";
  }

  const normalized = value.trim();

  if (!normalized) {
    return "Unknown";
  }

  if (normalized.includes(":")) {
    const parts = normalized.split(":");
    return `${parts.slice(0, 2).join(":")}:****`;
  }

  const parts = normalized.split(".");

  return parts.length === 4
    ? `${parts[0]}.${parts[1]}.***.***`
    : "Masked";
}

export function summarizeMetadata(
  value: unknown
): string {
  if (!value || typeof value !== "object") {
    return "No additional metadata";
  }

  const keys = Object.keys(
    value as Record<string, unknown>
  )
    .filter(
      (key) =>
        !/token|password|secret|cookie|authorization|credential/i.test(
          key
        )
    )
    .slice(0, 5);

  return keys.length > 0
    ? `Recorded fields: ${keys.join(", ")}`
    : "Sensitive metadata redacted";
}
