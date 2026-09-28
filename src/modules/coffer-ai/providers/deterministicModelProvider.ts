import { CofferAiError } from "../errors/cofferAiError.js";
import type {
  GroundedModelProvider,
} from "./groundedModelProvider.js";

/**
 * Explicit zero-cost provider.
 *
 * The response composer already has a deterministic evidence formatter.
 * This provider intentionally reports itself as not configured so the
 * composer never attempts an external/local model call.
 */
export function createDeterministicModelProvider(): GroundedModelProvider {
  return {
    id: "deterministic",

    isConfigured() {
      return false;
    },

    async generate() {
      throw new CofferAiError({
        code: "AI_MODEL_DISABLED",
        message:
          "Coffer AI is running in deterministic-only mode.",
        statusCode: 503,
      });
    },
  };
}
