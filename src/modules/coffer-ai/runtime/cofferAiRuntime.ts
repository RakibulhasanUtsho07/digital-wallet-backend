import {
  createCompositeAiAuditSink,
  createMongoAiAuditSink,
  createRedactedLoggerAuditSink,
} from "../audit/aiAuditSink.js";

import {
  loadCofferAiConfig,
} from "../config/cofferAiConfig.js";

import {
  createAiChatController,
} from "../controllers/aiChatController.js";
import { createAiConversationController } from "../controllers/aiConversationController.js";
import { mongoAiConversationStore } from "../controllers/aiConversationStore.js";



import {
  cofferOwnedPaymentReader,
} from "../integrations/cofferOwnedPaymentReader.js";



import {
  TemplateExplanationProvider,
} from "../providers/aiExplanationProvider.js";

import {
  createAiChatService,
} from "../services/aiChatService.js";

import {
  AiToolRegistry,
} from "../tools/aiToolRegistry.js";

import {
  createGetOwnPaymentTimelineTool,
} from "../tools/user/getOwnPaymentTimelineTool.js";

/* =========================================================
   CONFIGURATION
========================================================= */

const config =
  loadCofferAiConfig();

/* =========================================================
   TOOL REGISTRY
========================================================= */

const toolRegistry =
  new AiToolRegistry();

toolRegistry.register(
  createGetOwnPaymentTimelineTool(
    cofferOwnedPaymentReader,
  ),
);

/* =========================================================
   REDACTED AUDIT SINK

   No prompt text, raw database record, payment payload, token, or secret is
   present in this event contract.
========================================================= */

const auditSink =
  createCompositeAiAuditSink([
    createRedactedLoggerAuditSink({
      info(event) {
        console.info(
          "COFFER_AI_AUDIT",
          event,
        );
      },
    }),
    createMongoAiAuditSink({
      error(message, error) {
        console.error(
          message,
          error instanceof Error
            ? error.message
            : error,
        );
      },
    }),
  ]);

/* =========================================================
   SERVICE
========================================================= */

const service =
  createAiChatService({
    config,
    toolRegistry,
    explanationProvider:
      new TemplateExplanationProvider(),
    auditSink,
    conversationStore:
      mongoAiConversationStore,
  });

/* =========================================================
   CONTROLLER
========================================================= */

export const cofferAiChatController =
  createAiChatController({
    config,
    service,
  }).chat;

const conversationController =
  createAiConversationController({
    config,
    conversationStore:
      mongoAiConversationStore,
  });

export const cofferAiListConversationsController =
  conversationController.list;

export const cofferAiConversationMessagesController =
  conversationController.messages;

export const cofferAiFeedbackController =
  conversationController.feedback;
