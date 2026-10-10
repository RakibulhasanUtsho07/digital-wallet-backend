import { CofferAiError } from "../errors/cofferAiError.js";
import type {
  GroundedModelProvider,
  GroundedModelResponse,
} from "./groundedModelProvider.js";

type UnknownRecord =
  Record<string, unknown>;

function asRecord(
  value: unknown,
): UnknownRecord | null {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function extractOllamaText(
  payload: unknown,
): string {
  const root = asRecord(payload);
  const message =
    asRecord(root?.message);

  if (
    typeof message?.content === "string" &&
    message.content.trim()
  ) {
    return message.content.trim();
  }

  if (
    typeof root?.response === "string" &&
    root.response.trim()
  ) {
    return root.response.trim();
  }

  return "";
}

export function createOllamaChatProvider(input: {
  baseUrl: string;
  defaultModel: string | null;
  keepAlive: string;
  temperature: number;
}): GroundedModelProvider {
  const baseUrl =
    input.baseUrl
      .trim()
      .replace(/\/+$/, "");

  const defaultModel =
    input.defaultModel?.trim() ||
    null;

  return {
    id: "ollama-local",

    isConfigured() {
      return Boolean(
        baseUrl &&
        defaultModel,
      );
    },

    async generate(request) {
      const model =
        request.model.trim() ||
        defaultModel;

      if (!model) {
        throw new CofferAiError({
          code: "AI_LOCAL_MODEL_NOT_CONFIGURED",
          message:
            "No local Ollama model is configured.",
          statusCode: 503,
        });
      }

      const controller =
        new AbortController();

      const timer =
        globalThis.setTimeout(
          () => controller.abort(),
          request.timeoutMs,
        );

      try {
        const response =
          await fetch(
            `${baseUrl}/api/chat`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                model,
                stream: false,
                keep_alive:
                  input.keepAlive,
                messages: [
                  {
                    role: "system",
                    content:
                      request.instructions,
                  },
                  {
                    role: "user",
                    content:
                      request.input,
                  },
                ],
                options: {
                  temperature:
                    input.temperature,
                  num_predict:
                    request.maxOutputTokens,
                },
              }),
              signal:
                controller.signal,
            },
          );

        const payload: unknown =
          await response
            .json()
            .catch(() => null);

        if (!response.ok) {
          const root =
            asRecord(payload);

          const providerMessage =
            typeof root?.error ===
            "string"
              ? root.error
              : "The local Ollama model request failed.";

          throw new CofferAiError({
            code: "AI_LOCAL_MODEL_REQUEST_FAILED",
            message:
              providerMessage,
            statusCode: 502,
          });
        }

        const text =
          extractOllamaText(
            payload,
          );

        if (!text) {
          throw new CofferAiError({
            code: "AI_LOCAL_MODEL_EMPTY_RESPONSE",
            message:
              "The local Ollama model returned an empty response.",
            statusCode: 502,
          });
        }

        const root =
          asRecord(payload);

        const responseId =
          typeof root?.created_at ===
          "string"
            ? root.created_at
            : null;

        const result: GroundedModelResponse = {
          text,
          provider:
            "ollama-local",
          model,
          responseId,
        };

        return result;
      } catch (error) {
        if (
          error instanceof Error &&
          error.name ===
            "AbortError"
        ) {
          throw new CofferAiError({
            code: "AI_LOCAL_MODEL_TIMEOUT",
            message:
              "The local Ollama model timed out.",
            statusCode: 504,
          });
        }

        throw error;
      } finally {
        globalThis.clearTimeout(
          timer,
        );
      }
    },
  };
}
