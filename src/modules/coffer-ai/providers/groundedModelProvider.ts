import type {
  AiModelTier,
} from "../routing/aiModelRouter.js";

export interface GroundedModelRequest {
  model: string;
  tier: AiModelTier;
  instructions: string;
  input: string;
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface GroundedModelResponse {
  text: string;
  provider: string;
  model: string;
  responseId: string | null;
}

export interface GroundedModelProvider {
  readonly id: string;

  /**
   * Returns true only when this provider has enough local/runtime
   * configuration to accept requests.
   */
  isConfigured(): boolean;

  /**
   * Generates a natural-language explanation from backend-grounded
   * evidence. The provider is never the source of truth.
   */
  generate(
    input: GroundedModelRequest,
  ): Promise<GroundedModelResponse>;
}
