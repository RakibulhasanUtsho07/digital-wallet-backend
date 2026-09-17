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

    if (
      normalized.length > 0 &&
      normalized !== "[object Object]"
    ) {
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
    normalized === "merchant" ||
    normalized === "merchant_owner" ||
    normalized === "business"
  ) {
    return "merchant";
  }

  if (normalized === "user" || normalized === "customer") {
    return "user";
  }

  if (normalized === "admin" || normalized === "super_admin") {
    return "admin";
  }

  return "guest";
}

function resolveAccountState(value: unknown): AiAccountState {
  const normalized = normalizeToken(value);

  if (normalized === "deleted") {
    return "disabled";
  }

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

  if (
    normalized === "approved" ||
    normalized === "completed"
  ) {
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

  if (normalized === "test" || normalized === "sandbox") {
    return "test";
  }

  if (normalized === "live" || normalized === "production") {
    return "live";
  }

  return "unknown";
}

function capabilitiesFor(
  actorType: AiActorType,
  merchantId: string | null,
): ReadonlyArray<AiCapability> {
  if (actorType === "user") {
    return [
      "profile:read:self",
      "kyc:read:self",
      "wallet:read:self",
      "payment:read:self",
    ];
  }

  if (actorType === "merchant" && merchantId) {
    return [
      "merchant:profile:read:self",
      "merchant:payment:read:self",
      "merchant:webhook:read:self",
      "merchant:payout:read:self",
    ];
  }

  return [];
}

/**
 * Resolves identity only from server-attached principals. It intentionally has
 * no access to request.body, request.query, or page context.
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
