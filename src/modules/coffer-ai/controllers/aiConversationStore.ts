import {
  randomUUID,
} from "node:crypto";

import mongoose from "mongoose";

import {
  AiConversation,
} from "../../../models/AiConversation.js";
import {
  AiFeedback,
} from "../../../models/AiFeedback.js";
import {
  AiMessage,
} from "../../../models/AiMessage.js";
import {
  CofferAiError,
  isCofferAiError,
} from "../errors/cofferAiError.js";
import {
  sanitizeAiText,
} from "../privacy/aiPrivacySanitizer.js";
import type {
  AiActorType,
  AiChatResponseData,
  AiIntent,
} from "../types/cofferAi.types.js";

export interface AiConversationSummary {
  conversationId: string;
  title: string;
  lastIntent: string;
  lastMessageAt: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AiConversationMessage {
  messageId: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  requestId: string;
  intent: string;
  verification: "verified" | "partial" | "unknown";
  confidence: "high" | "medium" | "low";
  subjectType?: "gateway_payment" | "wallet_transaction";
  resourceId?: string;
  sources: ReadonlyArray<{
    type: string;
    label: string;
    reference: string;
  }>;
  suggestedActions: ReadonlyArray<{
    label: string;
    href?: string;
  }>;
  createdAt: string;
}

export interface AiConversationStore {
  saveExchange(input: {
    ownerId: string;
    actorType: AiActorType;
    requestedConversationId?: string;
    userMessage: string;
    assistantMessage: Omit<
      AiChatResponseData,
      "conversationId"
    >;
    intent: AiIntent;
    requestId: string;
  }): Promise<string>;

  listConversations(input: {
    ownerId: string;
    limit: number;
  }): Promise<ReadonlyArray<AiConversationSummary>>;

  listMessages(input: {
    ownerId: string;
    conversationId: string;
    limit: number;
  }): Promise<ReadonlyArray<AiConversationMessage>>;

  saveFeedback(input: {
    ownerId: string;
    conversationId: string;
    messageId: string;
    rating: "helpful" | "not_helpful";
    comment?: string;
  }): Promise<void>;
}

function ownerObjectId(
  ownerId: string,
): mongoose.Types.ObjectId {
  if (!mongoose.isValidObjectId(ownerId)) {
    throw new CofferAiError({
      code: "AI_ACTOR_INVALID",
      message: "The authenticated account could not be verified.",
      statusCode: 401,
    });
  }

  return new mongoose.Types.ObjectId(ownerId);
}

function safeDate(
  value: unknown,
): string {
  const date =
    value instanceof Date
      ? value
      : new Date(
          typeof value === "string"
            ? value
            : Date.now(),
        );

  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
}

function persistenceError(
  error: unknown,
): CofferAiError {
  if (isCofferAiError(error)) {
    return error;
  }

  return new CofferAiError({
    code: "AI_PERSISTENCE_FAILED",
    message: "Coffer AI could not save the conversation. Please try again.",
    statusCode: 500,
  });
}

function safeStoredText(
  value: string,
): string {
  const sanitized =
    sanitizeAiText(value).content;

  return sanitized || "[Message redacted]";
}

export const mongoAiConversationStore:
  AiConversationStore = {
  async saveExchange(input) {
    try {
      const ownerId =
        ownerObjectId(input.ownerId);
      const isExistingConversation =
        Boolean(input.requestedConversationId);
      const conversationId =
        input.requestedConversationId ??
        randomUUID();
      const now =
        new Date();
      const userMessage =
        safeStoredText(input.userMessage);

      if (isExistingConversation) {
        const ownedConversation =
          await AiConversation.exists({
            conversationId,
            ownerId,
            archived: false,
          });

        if (!ownedConversation) {
          throw new CofferAiError({
            code: "AI_CONVERSATION_NOT_FOUND",
            message: "Conversation not found.",
            statusCode: 404,
          });
        }
      } else {
        await AiConversation.create({
          conversationId,
          ownerId,
          actorType:
            input.actorType === "merchant"
              ? "merchant"
              : "user",
          title:
            userMessage.slice(0, 120),
          lastIntent:
            input.intent,
          lastMessageAt:
            now,
          messageCount:
            0,
          archived:
            false,
        });
      }

      const assistantContent =
        safeStoredText(
          input.assistantMessage.content,
        );

      await AiMessage.insertMany([
        {
          messageId:
            randomUUID(),
          conversationId,
          ownerId,
          role:
            "user",
          content:
            userMessage,
          requestId:
            input.requestId,
          intent:
            input.intent,
          verification:
            "unknown",
          confidence:
            "low",
          sources:
            [],
          suggestedActions:
            [],
          createdAt:
            now,
          updatedAt:
            now,
        },
        {
          messageId:
            input.assistantMessage.messageId,
          conversationId,
          ownerId,
          role:
            "assistant",
          content:
            assistantContent,
          requestId:
            input.requestId,
          intent:
            input.intent,
          verification:
            input.assistantMessage.verification,
          confidence:
            input.assistantMessage.confidence,
          subjectType:
            input.assistantMessage.diagnosis?.subjectType,
          resourceId:
            input.assistantMessage.diagnosis?.subjectId,
          sources:
            input.assistantMessage.sources,
          suggestedActions:
            input.assistantMessage.suggestedActions,
          createdAt:
            now,
          updatedAt:
            now,
        },
      ]);

      const updated =
        await AiConversation.updateOne(
          {
            conversationId,
            ownerId,
            archived: false,
          },
          {
            $set: {
              lastIntent:
                input.intent,
              lastMessageAt:
                now,
            },
            $inc: {
              messageCount:
                2,
            },
          },
        );

      if (updated.matchedCount !== 1) {
        throw new CofferAiError({
          code: "AI_CONVERSATION_NOT_FOUND",
          message: "Conversation not found.",
          statusCode: 404,
        });
      }

      return conversationId;
    } catch (error) {
      throw persistenceError(error);
    }
  },

  async listConversations(input) {
    try {
      const ownerId =
        ownerObjectId(input.ownerId);
      const rows =
        await AiConversation.find({
          ownerId,
          archived: false,
        })
          .sort({
            lastMessageAt: -1,
          })
          .limit(input.limit)
          .select(
            "conversationId title lastIntent lastMessageAt messageCount createdAt updatedAt",
          )
          .lean();

      return rows.map(
        (row) => ({
          conversationId:
            String(row.conversationId),
          title:
            String(row.title),
          lastIntent:
            String(row.lastIntent),
          lastMessageAt:
            safeDate(row.lastMessageAt),
          messageCount:
            Number(row.messageCount),
          createdAt:
            safeDate(row.createdAt),
          updatedAt:
            safeDate(row.updatedAt),
        }),
      );
    } catch (error) {
      throw persistenceError(error);
    }
  },

  async listMessages(input) {
    try {
      const ownerId =
        ownerObjectId(input.ownerId);
      const ownedConversation =
        await AiConversation.exists({
          conversationId:
            input.conversationId,
          ownerId,
          archived: false,
        });

      if (!ownedConversation) {
        throw new CofferAiError({
          code: "AI_CONVERSATION_NOT_FOUND",
          message: "Conversation not found.",
          statusCode: 404,
        });
      }

      const rows =
        await AiMessage.find({
          conversationId:
            input.conversationId,
          ownerId,
        })
          .sort({
            createdAt: 1,
          })
          .limit(input.limit)
          .select(
            "messageId conversationId role content requestId intent verification confidence subjectType resourceId sources suggestedActions createdAt",
          )
          .lean();

      return rows.map(
        (row) => ({
          messageId:
            String(row.messageId),
          conversationId:
            String(row.conversationId),
          role:
            row.role,
          content:
            String(row.content),
          requestId:
            String(row.requestId),
          intent:
            String(row.intent),
          verification:
            row.verification,
          confidence:
            row.confidence,
          subjectType:
            row.subjectType,
          resourceId:
            row.resourceId,
          sources:
            row.sources.map(
              (source) => ({
                type:
                  source.type,
                label:
                  source.label,
                reference:
                  source.reference,
              }),
            ),
          suggestedActions:
            row.suggestedActions.map(
              (action) => ({
                label:
                  action.label,
                href:
                  action.href,
              }),
            ),
          createdAt:
            safeDate(row.createdAt),
        }),
      );
    } catch (error) {
      throw persistenceError(error);
    }
  },

  async saveFeedback(input) {
    try {
      const ownerId =
        ownerObjectId(input.ownerId);
      const assistantMessage =
        await AiMessage.exists({
          messageId:
            input.messageId,
          conversationId:
            input.conversationId,
          ownerId,
          role:
            "assistant",
        });

      if (!assistantMessage) {
        throw new CofferAiError({
          code: "AI_MESSAGE_NOT_FOUND",
          message: "Assistant message not found.",
          statusCode: 404,
        });
      }

      const comment =
        input.comment
          ? safeStoredText(
              input.comment,
            ).slice(0, 500)
          : undefined;

      await AiFeedback.findOneAndUpdate(
        {
          ownerId,
          messageId:
            input.messageId,
        },
        {
          $set: {
            conversationId:
              input.conversationId,
            rating:
              input.rating,
            comment,
          },
          $setOnInsert: {
            ownerId,
            messageId:
              input.messageId,
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      );
    } catch (error) {
      throw persistenceError(error);
    }
  },
};

/**
 * Test-only fallback used when a unit-test harness does not connect MongoDB.
 * Production runtime always injects mongoAiConversationStore.
 */
export const transientAiConversationStore:
  AiConversationStore = {
  async saveExchange(input) {
    return (
      input.requestedConversationId ??
      randomUUID()
    );
  },
  async listConversations() {
    return [];
  },
  async listMessages() {
    return [];
  },
  async saveFeedback() {
    return;
  },
};
