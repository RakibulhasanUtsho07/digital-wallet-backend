import type {
  AiConversationMessage,
  AiConversationStore,
} from "../persistence/aiConversationStore.js";
import type {
  AiActorType,
  AiIntent,
} from "../types/cofferAi.types.js";

export interface AiConversationContext {
  messages: ReadonlyArray<{
    role: "user" | "assistant";
    content: string;
  }>;
  lastResourceId: string | null;
  lastIntent: AiIntent | null;
}

export interface AiConversationContextService {
  load(input: {
    ownerId: string;
    actorType: AiActorType;
    conversationId?: string;
    limit: number;
  }): Promise<AiConversationContext>;
}

function asIntent(
  value: string,
): AiIntent | null {
  const allowed =
    new Set<AiIntent>([
      "payment_diagnosis",
      "merchant_payment_diagnosis",
      "wallet_summary",
      "kyc_status",
      "merchant_overview",
      "support_investigation",
      "support_operations_summary",
      "analyst_wallet_snapshot",
      "analyst_payment_snapshot",
      "analyst_risk_snapshot",
      "analyst_revenue_snapshot",
      "admin_platform_overview",
      "admin_risk_snapshot",
      "admin_finance_snapshot",
      "public_product_help",
      "secret_request",
      "unknown",
    ]);

  return allowed.has(
    value as AiIntent,
  )
    ? value as AiIntent
    : null;
}

function buildContext(
  rows: ReadonlyArray<AiConversationMessage>,
): AiConversationContext {
  const recent =
    rows.slice(-12);

  const lastWithResource =
    [...recent]
      .reverse()
      .find(
        (item) =>
          Boolean(
            item.resourceId,
          ),
      );

  const lastAssistant =
    [...recent]
      .reverse()
      .find(
        (item) =>
          item.role ===
          "assistant",
      );

  return {
    messages:
      recent.map(
        (item) => ({
          role:
            item.role,
          content:
            item.content.slice(
              0,
              2_000,
            ),
        }),
      ),
    lastResourceId:
      lastWithResource
        ?.resourceId ??
      null,
    lastIntent:
      lastAssistant
        ? asIntent(
            lastAssistant.intent,
          )
        : null,
  };
}

export function createAiConversationContextService(
  store: AiConversationStore,
): AiConversationContextService {
  return {
    async load(input) {
      if (
        !input.conversationId
      ) {
        return {
          messages: [],
          lastResourceId:
            null,
          lastIntent:
            null,
        };
      }

      const rows =
        await store.listRecentMessages({
          ownerId:
            input.ownerId,
          actorType: input.actorType,
          conversationId:
            input.conversationId,
          limit:
            Math.min(
              20,
              Math.max(
                2,
                input.limit,
              ),
            ),
        });

      return buildContext(
        rows,
      );
    },
  };
}
