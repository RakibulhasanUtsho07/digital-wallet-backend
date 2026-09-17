import { CofferAiError } from "../errors/cofferAiError.js";
import type {
  AiActorContext,
  AiPolicyDecision,
  AiToolId,
} from "../types/cofferAi.types.js";

export interface AiToolDefinition {
  id: AiToolId;
  execute(input: {
    actor: AiActorContext;
    payload: Record<string, unknown>;
  }): Promise<unknown>;
}

export class AiToolRegistry {
  private readonly definitions = new Map<AiToolId, AiToolDefinition>();

  register(definition: AiToolDefinition): void {
    if (this.definitions.has(definition.id)) {
      throw new Error(`AI tool already registered: ${definition.id}`);
    }

    this.definitions.set(definition.id, definition);
  }

  async execute<T>(input: {
    toolId: AiToolId;
    actor: AiActorContext;
    policy: AiPolicyDecision;
    payload: Record<string, unknown>;
  }): Promise<T> {
    if (
      !input.policy.allow ||
      !input.policy.allowedToolIds.includes(input.toolId)
    ) {
      throw new CofferAiError({
        code: "AI_TOOL_NOT_AUTHORIZED",
        message: "The requested AI tool is not authorized.",
        statusCode: 403,
      });
    }

    const definition = this.definitions.get(input.toolId);

    if (!definition) {
      throw new CofferAiError({
        code: "AI_TOOL_NOT_CONFIGURED",
        message: "The requested AI capability is not configured.",
        statusCode: 503,
      });
    }

    return definition.execute({
      actor: input.actor,
      payload: input.payload,
    }) as Promise<T>;
  }
}
