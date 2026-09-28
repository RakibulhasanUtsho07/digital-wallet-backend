export type CofferAiProvider =
  | "deterministic"
  | "ollama"
  | "openai";

export interface CofferAiConfig {
  enabled: boolean;
  userAssistantEnabled: boolean;
  merchantAssistantEnabled: boolean;
  supportAssistantEnabled: boolean;
  analystAssistantEnabled: boolean;
  adminAssistantEnabled: boolean;
  publicAssistantEnabled: boolean;
  requireKnownAccountState: boolean;
  requireVerifiedMerchant: boolean;
  maxMessageLength: number;
  maxConversationIdLength: number;
  maxResourceIdLength: number;
  supportSearchLimit: number;

  /**
   * Provider mode:
   * - deterministic: zero-cost backend evidence only
   * - ollama: local model on the same PC/server
   * - openai: optional paid provider for later
   */
  provider: CofferAiProvider;
  modelEnabled: boolean;

  /* Provider-neutral model routing */
  fastModel: string | null;
  reasoningModel: string | null;
  modelTimeoutMs: number;
  modelMaxOutputTokens: number;

  /* Local Ollama */
  ollamaBaseUrl: string;
  ollamaModel: string | null;
  ollamaKeepAlive: string;
  ollamaTemperature: number;

  /* Optional OpenAI */
  openAiApiKey: string | null;
  openAiBaseUrl: string;

  /* Context + published knowledge retrieval */
  conversationContextMessages: number;
  knowledgeEnabled: boolean;
  knowledgeLimit: number;
}

type EnvSource =
  Record<string, string | undefined>;

function readBoolean(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined) {
    return fallback;
  }

  return (
    value
      .trim()
      .toLowerCase() ===
    "true"
  );
}

function readInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed =
    Number.parseInt(
      value ?? "",
      10,
    );

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(
    maximum,
    Math.max(
      minimum,
      parsed,
    ),
  );
}

function readNumber(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed =
    Number(
      value,
    );

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(
    maximum,
    Math.max(
      minimum,
      parsed,
    ),
  );
}

function readOptional(
  value: string | undefined,
): string | null {
  const normalized =
    value?.trim();

  return normalized
    ? normalized
    : null;
}

function readBaseUrl(
  value: string | undefined,
  fallback: string,
): string {
  const normalized =
    value?.trim() ||
    fallback;

  return normalized.replace(
    /\/+$/,
    "",
  );
}

function readProvider(
  value: string | undefined,
): CofferAiProvider {
  const normalized =
    value
      ?.trim()
      .toLowerCase();

  if (
    normalized ===
      "ollama" ||
    normalized ===
      "openai"
  ) {
    return normalized;
  }

  return "deterministic";
}

export function loadCofferAiConfig(
  env: EnvSource = process.env,
): CofferAiConfig {
  const provider =
    readProvider(
      env.AI_PROVIDER,
    );

  const ollamaModel =
    readOptional(
      env.OLLAMA_MODEL,
    );

  const providerDefaultModel =
    provider === "ollama"
      ? ollamaModel
      : null;

  return {
    enabled:
      readBoolean(
        env.AI_COPILOT_ENABLED,
        true,
      ),

    userAssistantEnabled:
      readBoolean(
        env.AI_USER_ASSISTANT_ENABLED,
        true,
      ),

    merchantAssistantEnabled:
      readBoolean(
        env.AI_MERCHANT_ASSISTANT_ENABLED,
        true,
      ),

    supportAssistantEnabled:
      readBoolean(
        env.AI_SUPPORT_ASSISTANT_ENABLED,
        true,
      ),

    analystAssistantEnabled:
      readBoolean(
        env.AI_ANALYST_ASSISTANT_ENABLED,
        true,
      ),

    adminAssistantEnabled:
      readBoolean(
        env.AI_ADMIN_ASSISTANT_ENABLED,
        true,
      ),

    publicAssistantEnabled:
      readBoolean(
        env.AI_PUBLIC_ASSISTANT_ENABLED,
        false,
      ),

    requireKnownAccountState:
      readBoolean(
        env.AI_REQUIRE_KNOWN_ACCOUNT_STATE,
        false,
      ),

    requireVerifiedMerchant:
      readBoolean(
        env.AI_REQUIRE_VERIFIED_MERCHANT,
        true,
      ),

    maxMessageLength:
      readInteger(
        env.AI_MAX_MESSAGE_LENGTH,
        4_000,
        100,
        8_000,
      ),

    maxConversationIdLength:
      readInteger(
        env.AI_MAX_CONVERSATION_ID_LENGTH,
        128,
        32,
        256,
      ),

    maxResourceIdLength:
      readInteger(
        env.AI_MAX_RESOURCE_ID_LENGTH,
        128,
        24,
        256,
      ),

    supportSearchLimit:
      readInteger(
        env.AI_SUPPORT_SEARCH_LIMIT,
        8,
        3,
        20,
      ),

    provider,

    modelEnabled:
      readBoolean(
        env.AI_MODEL_ENABLED,
        provider !==
          "deterministic",
      ),

    fastModel:
      readOptional(
        env.AI_MODEL_FAST,
      ) ??
      providerDefaultModel,

    reasoningModel:
      readOptional(
        env.AI_MODEL_REASONING,
      ) ??
      providerDefaultModel,

    modelTimeoutMs:
      readInteger(
        env.AI_MODEL_TIMEOUT_MS,
        30_000,
        3_000,
        120_000,
      ),

    modelMaxOutputTokens:
      readInteger(
        env.AI_MODEL_MAX_OUTPUT_TOKENS,
        700,
        150,
        2_500,
      ),

    ollamaBaseUrl:
      readBaseUrl(
        env.OLLAMA_BASE_URL,
        "http://127.0.0.1:11434",
      ),

    ollamaModel,

    ollamaKeepAlive:
      readOptional(
        env.OLLAMA_KEEP_ALIVE,
      ) ??
      "5m",

    ollamaTemperature:
      readNumber(
        env.OLLAMA_TEMPERATURE,
        0.1,
        0,
        1,
      ),

    openAiApiKey:
      readOptional(
        env.OPENAI_API_KEY,
      ),

    openAiBaseUrl:
      readBaseUrl(
        env.OPENAI_BASE_URL,
        "https://api.openai.com/v1",
      ),

    conversationContextMessages:
      readInteger(
        env.AI_CONVERSATION_CONTEXT_MESSAGES,
        10,
        2,
        20,
      ),

    knowledgeEnabled:
      readBoolean(
        env.AI_KNOWLEDGE_ENABLED,
        true,
      ),

    knowledgeLimit:
      readInteger(
        env.AI_KNOWLEDGE_LIMIT,
        4,
        1,
        8,
      ),
  };
}
