import { listMerchantApiKeys } from "../../../../services/merchantService.js";
import { getMerchantOverview } from "../../../../services/merchantOverviewService.js";
import { CofferAiError } from "../../errors/cofferAiError.js";
import type {
  AiDiagnosisCause,
  AiToolResult,
} from "../../types/cofferAi.types.js";
import type { AiToolDefinition } from "../aiToolRegistry.js";

type KeyMetadata = {
  keyId?: unknown;
  keyPrefix?: unknown;
  environment?: unknown;
  scopes?: unknown;
  status?: unknown;
  lastUsedAt?: unknown;
  expiresAt?: unknown;
  revokedAt?: unknown;
  name?: unknown;
  createdAt?: unknown;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function iso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function requestedScope(message: string): string | null {
  const match = message.match(/\b[a-z][a-z0-9_-]*:(?:read|write|manage)\b/i);
  return match ? match[0].toLowerCase() : null;
}

function requestedEnvironment(message: string): "test" | "live" | null {
  const value = message.toLowerCase();
  if (/\b(live|production)\b/.test(value)) return "live";
  if (/\b(test|sandbox)\b/.test(value)) return "test";
  return null;
}

export const merchantApiKeyDiagnosisTool: AiToolDefinition = {
  id: "merchant.api_key.diagnosis",

  async execute({ actor, payload }): Promise<AiToolResult> {
    if (
      actor.actorType !== "merchant" ||
      !actor.userId ||
      !actor.merchantId
    ) {
      throw new CofferAiError({
        code: "AI_MERCHANT_SCOPE_REQUIRED",
        message: "A merchant account context is required.",
        statusCode: 403,
      });
    }

    const keyId = text(payload.resourceId);
    const message = text(payload.message);

    if (!keyId) {
      throw new CofferAiError({
        code: "AI_API_KEY_ID_REQUIRED",
        message: "Please provide the API key ID you want me to diagnose.",
        statusCode: 400,
      });
    }

    const [rawKeys, overview] = await Promise.all([
      listMerchantApiKeys(actor.merchantId),
      getMerchantOverview({
        userId: actor.userId,
        period: "30d",
      }),
    ]);

    if (String(overview.merchant.id) !== actor.merchantId) {
      throw new CofferAiError({
        code: "AI_RESOURCE_SCOPE_MISMATCH",
        message: "The merchant context could not be verified.",
        statusCode: 403,
      });
    }

    const keys = rawKeys as unknown as KeyMetadata[];
    const key = keys.find((item) => text(item.keyId) === keyId);

    if (!key) {
      throw new CofferAiError({
        code: "AI_API_KEY_NOT_FOUND",
        message: "That API key metadata record was not found in this merchant account.",
        statusCode: 404,
      });
    }

    const status = text(key.status) || "unknown";
    const environment = text(key.environment) || "unknown";
    const scopes = Array.isArray(key.scopes)
      ? key.scopes.filter((scope): scope is string => typeof scope === "string")
      : [];
    const expiry = key.expiresAt ? new Date(String(key.expiresAt)) : null;
    const isPastExpiry = Boolean(
      expiry && Number.isFinite(expiry.getTime()) && expiry.getTime() <= Date.now(),
    );
    const scope = requestedScope(message);
    const requestedEnv = requestedEnvironment(message);
    const merchantVerification = text(overview.merchant.verificationStatus) || "unknown";
    const testEnabled = Boolean(overview.merchant.testEnabled);
    const liveEnabled = Boolean(overview.merchant.liveEnabled);

    let exactCause: AiDiagnosisCause | undefined;

    if (status === "revoked") {
      exactCause = {
        code: "api_key_revoked",
        label: "The API key metadata shows that this key is revoked.",
        evidenceRefs: ["apiKey.status"],
      };
    } else if (status === "expired" || isPastExpiry) {
      exactCause = {
        code: "api_key_expired",
        label: "The API key is expired or its recorded expiry time has passed.",
        evidenceRefs: ["apiKey.status", "apiKey.expiresAt"],
      };
    } else if (requestedEnv && environment !== requestedEnv) {
      exactCause = {
        code: "api_key_environment_mismatch",
        label: `The request refers to ${requestedEnv} mode, but this API key is a ${environment} key.`,
        evidenceRefs: ["apiKey.environment"],
      };
    } else if (environment === "live" && !liveEnabled) {
      exactCause = {
        code: "merchant_live_access_disabled",
        label: "This is a Live API key, but Live mode is not enabled for the merchant account.",
        evidenceRefs: ["apiKey.environment", "merchant.liveEnabled"],
      };
    } else if (environment === "live" && merchantVerification !== "verified") {
      exactCause = {
        code: "merchant_not_verified_for_live",
        label: "This is a Live API key, but merchant verification is not currently verified.",
        evidenceRefs: ["apiKey.environment", "merchant.verificationStatus"],
      };
    } else if (environment === "test" && !testEnabled) {
      exactCause = {
        code: "merchant_test_access_disabled",
        label: "This is a Test API key, but Test mode is disabled for the merchant account.",
        evidenceRefs: ["apiKey.environment", "merchant.testEnabled"],
      };
    } else if (scope && !scopes.map((item) => item.toLowerCase()).includes(scope)) {
      exactCause = {
        code: "api_key_scope_missing",
        label: `The API key does not include the requested ${scope} scope.`,
        evidenceRefs: ["apiKey.scopes"],
      };
    }

    const exact = Boolean(exactCause);

    const summary = exact
      ? `Verified state: API key ${keyId} metadata is ${status}.\nVerified cause: ${exactCause!.label}`
      : `Verified state: API key ${keyId} metadata is ${status} in ${environment} mode.\nDiagnosis: No exact request failure is recorded in API-key metadata, so a request-specific cause cannot be verified from this evidence alone.`;

    return {
      toolId: "merchant.api_key.diagnosis",
      title: "Merchant API-key diagnosis",
      summary,
      verification: exact ? "verified" : "partial",
      confidence: exact ? "high" : "medium",
      facts: [
        { label: "API key ID", value: keyId },
        { label: "Environment", value: environment },
        { label: "Status", value: status },
        { label: "Scopes", value: scopes.length ? scopes.join(", ") : null },
        { label: "Requested scope", value: scope },
        { label: "Requested environment", value: requestedEnv },
        { label: "Merchant verification", value: merchantVerification },
        { label: "Test mode enabled", value: testEnabled },
        { label: "Live mode enabled", value: liveEnabled },
        { label: "Last used at", value: iso(key.lastUsedAt) },
        { label: "Expires at", value: iso(key.expiresAt) },
        { label: "Revoked at", value: iso(key.revokedAt) },
        { label: "Secret access", value: false },
      ],
      sources: [
        {
          type: "merchant_api_key_metadata",
          label: "Owned merchant API-key metadata",
          reference: keyId,
        },
        {
          type: "merchant_profile",
          label: "Owned merchant eligibility state",
          reference: actor.merchantId,
        },
      ],
      suggestedActions: [
        {
          label: "Open API keys",
          href: "/dashboard/merchant/api-keys",
        },
        {
          label: "Open merchant developers",
          href: "/dashboard/merchant/developers",
        },
      ],
      diagnosis: {
        subjectType: "api",
        subjectId: keyId,
        state: status,
        exactCause,
        possibleCauses: [],
        nextSteps: [
          {
            label: exact
              ? "Review the key metadata and merchant environment before changing credentials"
              : "Compare the API response code, route, environment and required scope outside the AI secret boundary",
            href: "/dashboard/merchant/api-keys",
          },
        ],
        verified: exact,
      },
      data: {
        kind: "merchant_api_key_diagnosis",
        key: {
          keyId,
          name: text(key.name) || null,
          keyPrefix: text(key.keyPrefix) || null,
          environment,
          status,
          scopes,
          lastUsedAt: iso(key.lastUsedAt),
          expiresAt: iso(key.expiresAt),
          revokedAt: iso(key.revokedAt),
          secretAccess: false,
        },
        merchant: {
          verificationStatus: merchantVerification,
          testEnabled,
          liveEnabled,
        },
      },
    };
  },
};
