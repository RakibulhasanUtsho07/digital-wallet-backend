import { CofferAiError } from "../errors/cofferAiError.js";
import type {
  GroundedModelProvider,
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

function extractOutputText(
  payload: unknown,
): string {
  const root = asRecord(payload);

  if (!root) {
    return "";
  }

  if (
    typeof root.output_text === "string" &&
    root.output_text.trim()
  ) {
    return root.output_text.trim();
  }

  const output =
    Array.isArray(root.output)
      ? root.output
      : [];

  const parts: string[] = [];

  for (const item of output) {
    const record = asRecord(item);
    if (!record) continue;

    const content =
      Array.isArray(record.content)
        ? record.content
        : [];

    for (const child of content) {
      const contentRecord =
        asRecord(child);

      if (!contentRecord) continue;

      if (
        contentRecord.type === "output_text" &&
        typeof contentRecord.text === "string"
      ) {
        parts.push(
          contentRecord.text,
        );
      }
    }
  }

  return parts
    .join("\n")
    .trim();
}

export function createOpenAiResponsesProvider(input: {
  apiKey: string | null;
  baseUrl: string;
}): GroundedModelProvider {
  const apiKey =
    input.apiKey?.trim() ||
    null;

  const baseUrl =
    input.baseUrl
      .trim()
      .replace(/\/+$/, "");

  return {
    id: "openai-responses",

    isConfigured() {
      return Boolean(apiKey);
    },

    async generate(request) {
      if (!apiKey) {
        throw new CofferAiError({
          code: "AI_MODEL_NOT_CONFIGURED",
          message:
            "The model provider is not configured.",
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
            `${baseUrl}/responses`,
            {
              method: "POST",
              headers: {
                Authorization:
                  `Bearer ${apiKey}`,
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                model:
                  request.model,
                instructions:
                  request.instructions,
                input:
                  request.input,
                max_output_tokens:
                  request.maxOutputTokens,
                store: false,
                ...(request.tier ===
                "reasoning"
                  ? {
                      reasoning: {
                        effort:
                          "medium",
                      },
                    }
                  : {}),
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
          const errorRecord =
            asRecord(
              asRecord(payload)
                ?.error,
            );

          const providerMessage =
            typeof errorRecord?.message ===
            "string"
              ? errorRecord.message
              : "Model provider request failed.";

          throw new CofferAiError({
            code: "AI_MODEL_REQUEST_FAILED",
            message:
              providerMessage,
            statusCode: 502,
          });
        }

        const text =
          extractOutputText(
            payload,
          );

        if (!text) {
          throw new CofferAiError({
            code: "AI_MODEL_EMPTY_RESPONSE",
            message:
              "The model provider returned an empty response.",
            statusCode: 502,
          });
        }

        const root =
          asRecord(payload);

        return {
          text,
          provider:
            "openai-responses",
          model:
            request.model,
          responseId:
            typeof root?.id ===
            "string"
              ? root.id
              : null,
        };
      } catch (error) {
        if (
          error instanceof Error &&
          error.name ===
            "AbortError"
        ) {
          throw new CofferAiError({
            code: "AI_MODEL_TIMEOUT",
            message:
              "The model provider timed out.",
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
