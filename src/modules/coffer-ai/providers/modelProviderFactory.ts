import type {
  CofferAiConfig,
} from "../config/cofferAiConfig.js";
import {
  createDeterministicModelProvider,
} from "./deterministicModelProvider.js";
import type {
  GroundedModelProvider,
} from "./groundedModelProvider.js";
import {
  createOllamaChatProvider,
} from "./ollamaChatProvider.js";
import {
  createOpenAiResponsesProvider,
} from "./openAiResponsesProvider.js";

export function createGroundedModelProvider(
  config: CofferAiConfig,
): GroundedModelProvider {
  if (
    config.provider ===
    "ollama"
  ) {
    return createOllamaChatProvider({
      baseUrl:
        config.ollamaBaseUrl,
      defaultModel:
        config.ollamaModel,
      keepAlive:
        config.ollamaKeepAlive,
      temperature:
        config.ollamaTemperature,
    });
  }

  if (
    config.provider ===
    "openai"
  ) {
    return createOpenAiResponsesProvider({
      apiKey:
        config.openAiApiKey,
      baseUrl:
        config.openAiBaseUrl,
    });
  }

  return createDeterministicModelProvider();
}
