import type {
  AiActorContext,
  AiConfidenceLevel,
  AiIntent,
  AiVerificationLevel,
} from "../types/cofferAi.types.js";

export type AiModelTier =
  | "none"
  | "fast"
  | "reasoning";

export interface AiModelSelection {
  enabled: boolean;
  tier: AiModelTier;
  model: string | null;
  reason: string;
}

export function selectAiModel(input: {
  actor: AiActorContext;
  intent: AiIntent;
  verification: AiVerificationLevel;
  confidence: AiConfidenceLevel;
  modelEnabled: boolean;
  fastModel: string | null;
  reasoningModel: string | null;
}): AiModelSelection {
  if (!input.modelEnabled) {
    return {
      enabled: false,
      tier: "none",
      model: null,
      reason: "MODEL_PROVIDER_DISABLED",
    };
  }

  const needsReasoning =
    input.intent === "support_investigation" ||
    input.intent === "payment_diagnosis" ||
    input.intent === "merchant_payment_diagnosis" ||
    input.verification !== "verified" ||
    input.confidence !== "high";

  if (
    needsReasoning &&
    input.reasoningModel
  ) {
    return {
      enabled: true,
      tier: "reasoning",
      model: input.reasoningModel,
      reason: "DIAGNOSTIC_OR_UNCERTAIN_REQUEST",
    };
  }

  if (input.fastModel) {
    return {
      enabled: true,
      tier: "fast",
      model: input.fastModel,
      reason: "GROUNDED_EXPLANATION_REQUEST",
    };
  }

  if (input.reasoningModel) {
    return {
      enabled: true,
      tier: "reasoning",
      model: input.reasoningModel,
      reason: "FAST_MODEL_NOT_CONFIGURED",
    };
  }

  return {
    enabled: false,
    tier: "none",
    model: null,
    reason: "NO_MODEL_CONFIGURED",
  };
}
