import { CofferAiError } from "../../errors/cofferAiError.js";
import { investigateSupportIssue } from "../../diagnostics/supportInvestigationService.js";
import type { AiToolDefinition } from "../aiToolRegistry.js";

export const supportInvestigationTool: AiToolDefinition = {
  id: "support.investigate",
  async execute({ actor, payload }) {
    if (actor.actorType !== "support") {
      throw new CofferAiError({
        code: "AI_SUPPORT_SCOPE_REQUIRED",
        message: "A Support Agent role is required for this investigation.",
        statusCode: 403,
      });
    }

    const message =
      typeof payload.message === "string"
        ? payload.message.trim()
        : "";

    const resourceId =
      typeof payload.resourceId === "string"
        ? payload.resourceId.trim()
        : null;

    const result = await investigateSupportIssue({
      message,
      resourceId,
      limit: 8,
    });

    return {
      toolId: "support.investigate" as const,
      title: "Support investigation",
      ...result,
    };
  },
};
