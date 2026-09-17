import { randomUUID } from "node:crypto";

import type {
  Request,
  Response,
} from "express";

import type { CofferAiConfig } from "../config/cofferAiConfig.js";
import {
  CofferAiError,
  isCofferAiError,
} from "../errors/cofferAiError.js";
import type { AiChatService } from "../services/aiChatService.js";
import type {
  AiChatRequestInput,
  AiPageContextInput,
  TrustedMerchantPrincipal,
  TrustedUserPrincipal,
} from "../types/cofferAi.types.js";

type AuthenticatedRequest = Request & {
  user?: TrustedUserPrincipal | null;
  merchant?: TrustedMerchantPrincipal | null;
};

function safeRequestId(request: Request): string {
  const raw = request.headers["x-request-id"];
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (
    typeof value === "string" &&
    value.length >= 8 &&
    value.length <= 128 &&
    /^[a-zA-Z0-9_.:-]+$/.test(value)
  ) {
    return value;
  }

  return randomUUID();
}

function optionalSafeId(
  value: unknown,
  maximum: number,
  fieldName: string,
): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (
    typeof value !== "string" ||
    value.trim().length > maximum ||
    !/^[a-zA-Z0-9_-]+$/.test(value.trim())
  ) {
    throw new CofferAiError({
      code: "AI_REQUEST_INVALID",
      message: `${fieldName} is invalid.`,
      statusCode: 400,
    });
  }

  return value.trim();
}

function parsePageContext(
  value: unknown,
  config: CofferAiConfig,
): AiPageContextInput | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new CofferAiError({
      code: "AI_REQUEST_INVALID",
      message: "pageContext is invalid.",
      statusCode: 400,
    });
  }

  const record = value as Record<string, unknown>;
  let route: string | undefined;

  if (record.route !== undefined) {
    if (
      typeof record.route !== "string" ||
      !record.route.startsWith("/") ||
      record.route.length > 300
    ) {
      throw new CofferAiError({
        code: "AI_REQUEST_INVALID",
        message: "pageContext.route is invalid.",
        statusCode: 400,
      });
    }

    route = record.route;
  }

  const resourceId = optionalSafeId(
    record.resourceId,
    config.maxResourceIdLength,
    "pageContext.resourceId",
  );

  return {
    route,
    resourceId,
  };
}

function parseBody(
  value: unknown,
  config: CofferAiConfig,
): AiChatRequestInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CofferAiError({
      code: "AI_REQUEST_INVALID",
      message: "A JSON request body is required.",
      statusCode: 400,
    });
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.message !== "string" ||
    record.message.trim().length === 0 ||
    record.message.trim().length > config.maxMessageLength
  ) {
    throw new CofferAiError({
      code: "AI_MESSAGE_INVALID",
      message: `Message must contain between 1 and ${config.maxMessageLength} characters.`,
      statusCode: 400,
    });
  }

  return {
    message: record.message.trim(),
    conversationId: optionalSafeId(
      record.conversationId,
      config.maxConversationIdLength,
      "conversationId",
    ),
    pageContext: parsePageContext(record.pageContext, config),
  };
}

export function createAiChatController(dependencies: {
  config: CofferAiConfig;
  service: AiChatService;
}) {
  return {
    chat: async (request: Request, response: Response): Promise<void> => {
      const requestId = safeRequestId(request);

      try {
        const authenticatedRequest = request as AuthenticatedRequest;
        const body = parseBody(request.body, dependencies.config);
        const result = await dependencies.service.chat({
          requestId,
          source: {
            // Only server-attached principals are forwarded. request.body,
            // query, and headers cannot supply identity or role.
            user: authenticatedRequest.user,
            merchant: authenticatedRequest.merchant,
          },
          body,
        });

        response.status(200).json(result);
      } catch (error) {
        const safeError = isCofferAiError(error)
          ? error
          : new CofferAiError({
              code: "AI_INTERNAL_ERROR",
              message:
                "Coffer AI could not complete the request. Please try again.",
              statusCode: 500,
              expose: true,
            });

        response.status(safeError.statusCode).json({
          success: false,
          message: safeError.expose
            ? safeError.message
            : "Coffer AI could not complete the request.",
          error: {
            code: safeError.code,
            requestId,
          },
        });
      }
    },
  };
}
