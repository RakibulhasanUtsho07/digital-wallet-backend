import { listMerchantApiKeys } from "../../../../services/merchantService.js";
import { CofferAiError } from "../../errors/cofferAiError.js";
import type { AiToolDefinition } from "../aiToolRegistry.js";

type SafeKeyMetadata = {
  environment?: unknown;
  status?: unknown;
  scopes?: unknown;
  lastUsedAt?: unknown;
  expiresAt?: unknown;
};

export const merchantApiKeySummaryTool: AiToolDefinition = {
  id: "merchant.api_keys.summary",

  async execute({ actor }) {
    if (actor.actorType !== "merchant" || !actor.merchantId) {
      throw new CofferAiError({
        code: "AI_MERCHANT_SCOPE_REQUIRED",
        message: "A merchant account context is required.",
        statusCode: 403,
      });
    }

    // listMerchantApiKeys deliberately selects metadata only. It does not
    // select secretHash and can never return a plaintext API secret.
    const rawKeys = await listMerchantApiKeys(actor.merchantId);
    const keys = rawKeys as unknown as SafeKeyMetadata[];
    const now = Date.now();

    const active = keys.filter((key) => String(key.status ?? "") === "active").length;
    const revoked = keys.filter((key) => String(key.status ?? "") === "revoked").length;
    const expired = keys.filter((key) => {
      if (String(key.status ?? "") === "expired") return true;
      if (!key.expiresAt) return false;
      const date = new Date(String(key.expiresAt));
      return Number.isFinite(date.getTime()) && date.getTime() <= now;
    }).length;
    const test = keys.filter((key) => String(key.environment ?? "") === "test").length;
    const live = keys.filter((key) => String(key.environment ?? "") === "live").length;

    const scopes = Array.from(
      new Set(
        keys.flatMap((key) =>
          Array.isArray(key.scopes)
            ? key.scopes.filter((scope): scope is string => typeof scope === "string")
            : [],
        ),
      ),
    ).sort();

    const lastUsedAt = keys
      .map((key) => (key.lastUsedAt ? new Date(String(key.lastUsedAt)) : null))
      .filter((date): date is Date => Boolean(date) && Number.isFinite(date!.getTime()))
      .sort((a, b) => b.getTime() - a.getTime())[0];

    return {
      toolId: "merchant.api_keys.summary" as const,
      title: "Merchant API-key metadata",
      summary:
        `${keys.length} API-key metadata record${keys.length === 1 ? " is" : "s are"} available: ` +
        `${active} active, ${revoked} revoked, and ${expired} expired or past expiry. No API secret is exposed.`,
      verification: "verified" as const,
      confidence: "high" as const,
      facts: [
        { label: "Total key records", value: keys.length },
        { label: "Active keys", value: active },
        { label: "Revoked keys", value: revoked },
        { label: "Expired or past expiry", value: expired },
        { label: "Test-mode keys", value: test },
        { label: "Live-mode keys", value: live },
        { label: "Configured scopes", value: scopes.length ? scopes.join(", ") : null },
        { label: "Most recent key use", value: lastUsedAt?.toISOString() ?? null },
      ],
      sources: [
        {
          type: "merchant_api_key_metadata",
          label: "Owned merchant API-key metadata",
          reference: actor.merchantId,
        },
      ],
      suggestedActions: [
        { label: "Open API keys", href: "/dashboard/merchant/api-keys" },
      ],
      diagnosis: null,
      data: {
        kind: "merchant_api_key_summary",
        total: keys.length,
        active,
        revoked,
        expired,
        test,
        live,
        scopes,
        lastUsedAt: lastUsedAt?.toISOString() ?? null,
        secretAccess: false,
      },
    };
  },
};
