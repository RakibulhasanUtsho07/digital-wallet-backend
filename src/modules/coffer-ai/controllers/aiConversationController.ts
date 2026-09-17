import {
  randomUUID,
} from "node:crypto";

import type {
  Request,
  Response,
} from "express";

import type {
  CofferAiConfig,
} from "../config/cofferAiConfig.js";
import {
  resolveAiActorContext,
} from "../context/aiActorContextService.js";
import {
  CofferAiError,
  isCofferAiError,
} from "../errors/cofferAiError.js";

import type {
  TrustedMerchantPrincipal,
  TrustedUserPrincipal,
} from "../types/cofferAi.types.js";
import { AiConversationStore } from "./aiConversationStore.js";

type AuthenticatedRequest = Request & {
  user?: TrustedUserPrincipal | null;
  merchant?: TrustedMerchantPrincipal | null;
};

function requestId(
  request: Request,
): string {
  const raw =
    request.headers[
      "x-request-id"
    ];
  const value =
    Array.isArray(raw)
      ? raw[0]
      : raw;

  return typeof value === "string" &&
    /^[a-zA-Z0-9_.:-]{8,128}$/.test(value)
    ? value
    : randomUUID();
}

function ownerId(
  request: AuthenticatedRequest,
): string {
  const actor =
    resolveAiActorContext(
      {
        user:
          request.user,
        merchant:
          request.merchant,
      },
      requestId(request),
    );

  if (
    !actor.isAuthenticated ||
    !actor.userId ||
    (actor.actorType !== "user" &&
      actor.actorType !== "merchant")
  ) {
    throw new CofferAiError({
      code: "AI_AUTH_REQUIRED",
      message: "Please sign in to access AI conversations.",
      statusCode: 401,
    });
  }

  return actor.userId;
}

function safeId(
  value: unknown,
  maximum: number,
  fieldName: string,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.trim().length > maximum ||
    !/^[a-zA-Z0-9_-]+$/.test(
      value.trim(),
    )
  ) {
    throw new CofferAiError({
      code: "AI_REQUEST_INVALID",
      message: `${fieldName} is invalid.`,
      statusCode: 400,
    });
  }

  return value.trim();
}

function limit(
  value: unknown,
  fallback: number,
  maximum: number,
): number {
  if (
    typeof value !== "string" ||
    value.trim() === ""
  ) {
    return fallback;
  }

  const parsed =
    Number(value);

  return Number.isInteger(parsed) &&
    parsed > 0
    ? Math.min(parsed, maximum)
    : fallback;
}

function sendError(
  response: Response,
  error: unknown,
  currentRequestId: string,
): void {
  const safeError =
    isCofferAiError(error)
      ? error
      : new CofferAiError({
          code: "AI_INTERNAL_ERROR",
          message: "Coffer AI could not complete the request.",
          statusCode: 500,
        });

  response
    .status(safeError.statusCode)
    .json({
      success: false,
      message:
        safeError.message,
      error: {
        code:
          safeError.code,
        requestId:
          currentRequestId,
      },
    });
}

export function createAiConversationController(
  dependencies: {
    config: CofferAiConfig;
    conversationStore: AiConversationStore;
  },
) {
  return {
    list: async (
      request: Request,
      response: Response,
    ): Promise<void> => {
      const currentRequestId =
        requestId(request);

      try {
        const authenticated =
          request as AuthenticatedRequest;
        const conversations =
          await dependencies.conversationStore.listConversations({
            ownerId:
              ownerId(authenticated),
            limit:
              limit(
                request.query.limit,
                20,
                50,
              ),
          });

        response.status(200).json({
          success: true,
          data: {
            conversations,
          },
          meta: {
            requestId:
              currentRequestId,
            count:
              conversations.length,
          },
        });
      } catch (error) {
        sendError(
          response,
          error,
          currentRequestId,
        );
      }
    },

    messages: async (
      request: Request,
      response: Response,
    ): Promise<void> => {
      const currentRequestId =
        requestId(request);

      try {
        const authenticated =
          request as AuthenticatedRequest;
        const messages =
          await dependencies.conversationStore.listMessages({
            ownerId:
              ownerId(authenticated),
            conversationId:
              safeId(
                request.params.conversationId,
                dependencies.config
                  .maxConversationIdLength,
                "conversationId",
              ),
            limit:
              limit(
                request.query.limit,
                100,
                200,
              ),
          });

        response.status(200).json({
          success: true,
          data: {
            messages,
          },
          meta: {
            requestId:
              currentRequestId,
            count:
              messages.length,
          },
        });
      } catch (error) {
        sendError(
          response,
          error,
          currentRequestId,
        );
      }
    },

    feedback: async (
      request: Request,
      response: Response,
    ): Promise<void> => {
      const currentRequestId =
        requestId(request);

      try {
        const authenticated =
          request as AuthenticatedRequest;
        const body =
          request.body;

        if (
          !body ||
          typeof body !== "object" ||
          Array.isArray(body)
        ) {
          throw new CofferAiError({
            code: "AI_REQUEST_INVALID",
            message: "A JSON request body is required.",
            statusCode: 400,
          });
        }

        const record =
          body as Record<string, unknown>;
        const rating =
          record.rating;

        if (
          rating !== "helpful" &&
          rating !== "not_helpful"
        ) {
          throw new CofferAiError({
            code: "AI_FEEDBACK_INVALID",
            message: "rating must be helpful or not_helpful.",
            statusCode: 400,
          });
        }

        let comment:
          string |
          undefined;

        if (
          record.comment !== undefined &&
          record.comment !== null &&
          record.comment !== ""
        ) {
          if (
            typeof record.comment !== "string" ||
            record.comment.trim().length > 500
          ) {
            throw new CofferAiError({
              code: "AI_FEEDBACK_INVALID",
              message: "comment must contain at most 500 characters.",
              statusCode: 400,
            });
          }

          comment =
            record.comment.trim();
        }

        await dependencies.conversationStore.saveFeedback({
          ownerId:
            ownerId(authenticated),
          conversationId:
            safeId(
              request.params.conversationId,
              dependencies.config
                .maxConversationIdLength,
              "conversationId",
            ),
          messageId:
            safeId(
              record.messageId,
              128,
              "messageId",
            ),
          rating,
          comment,
        });

        response.status(200).json({
          success: true,
          message: "Feedback saved successfully.",
          meta: {
            requestId:
              currentRequestId,
          },
        });
      } catch (error) {
        sendError(
          response,
          error,
          currentRequestId,
        );
      }
    },
  };
}
