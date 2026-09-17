import express from "express";

import {
  getFraudRiskScore,
  getSpendingInsights,
} from "../controllers/aiController.js";

import {
  protect,
} from "../middlewares/authMiddleware.js";

import {
  cofferAiConversationMessagesController,
  cofferAiFeedbackController,
  cofferAiChatController,
  cofferAiListConversationsController,
} from "../modules/coffer-ai/runtime/cofferAiRuntime.js";

const router =
  express.Router();

/* =========================================================
   EXISTING AI FEATURES

   Existing endpoints remain unchanged.
========================================================= */

router.get(
  "/insights",
  protect,
  getSpendingInsights,
);

router.get(
  "/fraud-score",
  protect,
  getFraudRiskScore,
);

/* =========================================================
   COFFER AI COPILOT — READ ONLY

   POST /api/ai/chat

   `protect` resolves the trusted user from the current database/session.
   Client-supplied role, userId, merchantId, or ownerId is ignored.
========================================================= */

router.post(
  "/chat",
  protect,
  cofferAiChatController,
);

/* =========================================================
   OWNER-SCOPED CONVERSATION HISTORY
========================================================= */

router.get(
  "/conversations",
  protect,
  cofferAiListConversationsController,
);

router.get(
  "/conversations/:conversationId/messages",
  protect,
  cofferAiConversationMessagesController,
);

router.post(
  "/conversations/:conversationId/feedback",
  protect,
  cofferAiFeedbackController,
);

export default router;
