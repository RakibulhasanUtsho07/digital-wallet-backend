export interface CofferAiConfig {
  enabled: boolean;
  userAssistantEnabled: boolean;
  merchantAssistantEnabled: boolean;
  publicAssistantEnabled: boolean;
  requireKnownAccountState: boolean;
  requireVerifiedMerchant: boolean;
  maxMessageLength: number;
  maxConversationIdLength: number;
  maxResourceIdLength: number;
}

type EnvSource = Record<string, string | undefined>;

function readBoolean(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined) {
    return fallback;
  }

  return value.trim().toLowerCase() === "true";
}

function readInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, parsed));
}

export function loadCofferAiConfig(
  env: EnvSource = process.env,
): CofferAiConfig {
  return {
    // Safe rollout: every AI entry point is disabled until explicitly enabled.
    enabled: readBoolean(env.AI_COPILOT_ENABLED, false),
    userAssistantEnabled: readBoolean(
      env.AI_USER_ASSISTANT_ENABLED,
      false,
    ),
    merchantAssistantEnabled: readBoolean(
      env.AI_MERCHANT_ASSISTANT_ENABLED,
      false,
    ),
    publicAssistantEnabled: readBoolean(
      env.AI_PUBLIC_ASSISTANT_ENABLED,
      false,
    ),
    requireKnownAccountState: readBoolean(
      env.AI_REQUIRE_KNOWN_ACCOUNT_STATE,
      false,
    ),
    requireVerifiedMerchant: readBoolean(
      env.AI_REQUIRE_VERIFIED_MERCHANT,
      true,
    ),
    maxMessageLength: readInteger(
      env.AI_MAX_MESSAGE_LENGTH,
      2_000,
      100,
      8_000,
    ),
    maxConversationIdLength: readInteger(
      env.AI_MAX_CONVERSATION_ID_LENGTH,
      128,
      32,
      256,
    ),
    maxResourceIdLength: readInteger(
      env.AI_MAX_RESOURCE_ID_LENGTH,
      128,
      24,
      256,
    ),
  };
}
