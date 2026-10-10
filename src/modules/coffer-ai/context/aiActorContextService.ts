import type {
  AiAccountState,
  AiActorContext,
  AiActorType,
  AiCapability,
  AiEnvironmentMode,
  AiKycState,
  AiMerchantVerificationState,
  AiTrustedRequestSource,
} from "../types/cofferAi.types.js";

function asIdentifier(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (
    value !== null &&
    typeof value === "object" &&
    "toString" in value &&
    typeof value.toString === "function"
  ) {
    const normalized = value.toString().trim();

    if (normalized && normalized !== "[object Object]") {
      return normalized;
    }
  }

  return null;
}

function normalizeToken(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[\s-]+/g, "_")
    : "";
}

function resolveActorType(role: unknown): AiActorType {
  const normalized = normalizeToken(role);

  if (
    normalized === "user" ||
    normalized === "merchant" ||
    normalized === "support" ||
    normalized === "analyst" ||
    normalized === "admin" ||
    normalized === "super_admin"
  ) {
    return normalized;
  }

  if (normalized === "customer") return "user";
  if (normalized === "support_agent") return "support";
  if (normalized === "superadmin") return "super_admin";

  return "guest";
}

function resolveAccountState(value: unknown): AiAccountState {
  const normalized = normalizeToken(value);

  if (normalized === "deleted") return "disabled";

  if (
    normalized === "active" ||
    normalized === "pending" ||
    normalized === "suspended" ||
    normalized === "disabled" ||
    normalized === "locked"
  ) {
    return normalized;
  }

  return "unknown";
}

function resolveKycState(value: unknown): AiKycState {
  const normalized = normalizeToken(value);

  if (
    normalized === "not_started" ||
    normalized === "pending" ||
    normalized === "under_review" ||
    normalized === "verified" ||
    normalized === "rejected"
  ) {
    return normalized;
  }

  return "unknown";
}

function resolveMerchantVerificationState(
  value: unknown,
): AiMerchantVerificationState {
  const normalized = normalizeToken(value);

  if (normalized === "approved" || normalized === "completed") {
    return "verified";
  }

  if (
    normalized === "not_started" ||
    normalized === "pending" ||
    normalized === "verified" ||
    normalized === "rejected"
  ) {
    return normalized;
  }

  return "unknown";
}

function resolveEnvironmentMode(value: unknown): AiEnvironmentMode {
  const normalized = normalizeToken(value);

  if (normalized === "test" || normalized === "sandbox") return "test";
  if (normalized === "live" || normalized === "production") return "live";

  return "unknown";
}

function capabilitiesFor(
  actorType: AiActorType,
  merchantId: string | null,
): ReadonlyArray<AiCapability> {
  switch (actorType) {
    case "user":
      return [
        "profile:read:self",
        "kyc:read:self",
        "wallet:read:self",
        "payment:read:self",
        "transaction:read:self",
        "receipt:read:self",
        "security:read:self",
      ];

    case "merchant":
      return merchantId
        ? [
            "merchant:profile:read:self",
            "merchant:payment:read:self",
            "merchant:refund:read:self",
            "merchant:payout:read:self",
            "merchant:settlement:read:self",
            "merchant:webhook:read:self",
            "merchant:api_key:read:self",
            "merchant:analytics:read:self",
          ]
        : [];

    case "support":
      return [
        "support:operations:read",
        "support:customer:search",
        "support:payment:read",
        "support:transaction:read",
      ];

    case "analyst":
      return [
        "analyst:wallet:read",
        "analyst:payment:read",
        "analyst:risk:read",
        "analyst:revenue:read",
      ];

    case "admin":
    case "super_admin":
      return ["admin:platform:read"];

    default:
      return [];
  }
}

/**
 * Resolves identity only from server-attached principals.
 * request.body/query must never be copied into this identity context.
 */
export function resolveAiActorContext(
  source: AiTrustedRequestSource,
  requestId: string,
): AiActorContext {
  const principal = source.user ?? null;
  const userId = principal
    ? asIdentifier(principal.userId ?? principal.id ?? principal._id)
    : null;

  if (!principal || !userId) {
    return {
      requestId,
      actorType: "guest",
      isAuthenticated: false,
      userId: null,
      merchantId: null,
      accountState: "unknown",
      kycState: "unknown",
      merchantVerificationState: "unknown",
      environmentMode: "unknown",
      capabilities: [],
    };
  }

  const actorType = resolveActorType(principal.role);
  const merchant = source.merchant ?? null;
  const merchantId = asIdentifier(
    merchant?.merchantId ??
      merchant?.id ??
      merchant?._id ??
      principal.merchantId,
  );

  return {
    requestId,
    actorType,
    isAuthenticated: true,
    userId,
    merchantId,
    accountState: resolveAccountState(
      principal.accountStatus ?? principal.status,
    ),
    kycState: resolveKycState(principal.kycStatus),
    merchantVerificationState: resolveMerchantVerificationState(
      merchant?.verificationStatus ?? merchant?.status,
    ),
    environmentMode: resolveEnvironmentMode(
      merchant?.environment ?? merchant?.mode,
    ),
    capabilities: capabilitiesFor(actorType, merchantId),
  };
}
