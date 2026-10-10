import express from "express";

import {
  getFraudRiskScore,
  getSpendingInsights,
} from "../controllers/aiController.js";
import {
  protect,
  requireAdminOrSuperAdmin,
  requireSupport,
} from "../middlewares/authMiddleware.js";
import {
  cofferAiChatController,
  cofferAiConversationMessagesController,
  cofferAiFeedbackController,
  cofferAiListConversationsController,
} from "../modules/coffer-ai/runtime/cofferAiRuntime.js";
import {
  attachCofferAiMerchantContext,
} from "../modules/coffer-ai/middlewares/aiMerchantContextMiddleware.js";
import {
  cofferAiRateLimiter,
} from "../modules/coffer-ai/middlewares/cofferAiRateLimiter.js";
import {
  getSupportAiCommandCenterController,
} from "../modules/coffer-ai/controllers/aiSupportCommandCenterController.js";
import {
  evaluateSupportAlertsController,
  getSupportAlertController,
  listSupportAlertsController,
  updateSupportAlertController,
} from "../modules/coffer-ai/controllers/aiSupportAlertController.js";
import {
  completeSupportPlaybookRunController,
  getSupportPlaybookController,
  getSupportPlaybookRunController,
  listSupportPlaybooksController,
  recommendSupportCasePlaybooksController,
  startSupportCasePlaybookController,
  updateSupportPlaybookStepController,
} from "../modules/coffer-ai/controllers/aiSupportPlaybookController.js";
import {
  getSupportCaseOutcomeController,
  getSupportPlaybookEffectivenessController,
  getSupportResolutionQualityController,
  recordSupportCaseOutcomeController,
  reopenSupportCaseController,
} from "../modules/coffer-ai/controllers/aiSupportResolutionQualityController.js";
import {
  addSupportAiCaseNoteController,
  createSupportAiCaseController,
  getSupportAiCaseController,
  getSupportAiCaseCorrelationController,
  getSupportAiCaseTimelineController,
  getSupportAiIncidentController,
  listSupportAiCasesController,
  listSupportAiIncidentsController,
  updateSupportAiCaseController,
  updateSupportAiIncidentController,
} from "../modules/coffer-ai/controllers/aiSupportCaseController.js";
import {
  createSupportKnowledgeDraftController,
  getSupportKnowledgeDraftController,
  listSupportKnowledgeDraftsController,
  publishSupportKnowledgeDraftController,
  reviewSupportKnowledgeDraftController,
  submitSupportKnowledgeDraftController,
} from "../modules/coffer-ai/controllers/aiSupportKnowledgeLearningController.js";
import {
  getSupportAiHealthController,
} from "../modules/coffer-ai/controllers/aiSupportHealthController.js";
import {
  runSupportAlertEvaluationInternalController,
  runSupportMaintenanceInternalController,
} from "../modules/coffer-ai/controllers/aiSupportInternalController.js";
import {
  requireCofferAiCron,
} from "../modules/coffer-ai/middlewares/requireCofferAiCron.js";
import {
  submitAiRoleKnowledgeController,
  listAiRoleKnowledgeController,
  reviewAiRoleKnowledgeController,
  aiFeedbackInsightsController,
} from "../modules/coffer-ai/controllers/aiKnowledgeLearningController.js";

const router = express.Router();

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
   COFFER AI — ADVANCED ROLE-AWARE COPILOT

   Single canonical endpoint. No /v2 route and no v2 filenames.

   protect:
   - resolves current DB user/role from the authenticated session.

   attachCofferAiMerchantContext:
   - resolves merchant ownership only from the trusted authenticated user.

   Support role:
   - can use payment ID, transaction ID, customer ID/email/name for
     read-only first-line investigation.
   - receives recorded failure evidence + first-support guidance.
   - cannot execute financial mutations.
========================================================= */

router.post(
  "/chat",
  protect,
  attachCofferAiMerchantContext,
  cofferAiRateLimiter,
  cofferAiChatController,
);

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
  cofferAiRateLimiter,
  cofferAiFeedbackController,
);

router.post(
  "/learning/articles",
  protect,
  cofferAiRateLimiter,
  submitAiRoleKnowledgeController,
);

router.get(
  "/learning/articles",
  protect,
  requireAdminOrSuperAdmin,
  cofferAiRateLimiter,
  listAiRoleKnowledgeController,
);

router.patch(
  "/learning/articles/:articleId/review",
  protect,
  requireAdminOrSuperAdmin,
  cofferAiRateLimiter,
  reviewAiRoleKnowledgeController,
);

router.get(
  "/learning/feedback-insights",
  protect,
  requireAdminOrSuperAdmin,
  cofferAiRateLimiter,
  aiFeedbackInsightsController,
);



router.get(
  "/support/command-center",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  getSupportAiCommandCenterController,
);




router.get(
  "/support/quality",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  getSupportResolutionQualityController,
);

router.get(
  "/support/playbooks/effectiveness",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  getSupportPlaybookEffectivenessController,
);

router.get(
  "/support/cases/:caseId/outcome",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  getSupportCaseOutcomeController,
);

router.post(
  "/support/cases/:caseId/outcome",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  recordSupportCaseOutcomeController,
);

router.post(
  "/support/cases/:caseId/reopen",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  reopenSupportCaseController,
);

router.get(
  "/support/playbooks",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  listSupportPlaybooksController,
);

router.get(
  "/support/playbooks/:playbookId",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  getSupportPlaybookController,
);

router.get(
  "/support/cases/:caseId/playbooks/recommend",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  recommendSupportCasePlaybooksController,
);

router.post(
  "/support/cases/:caseId/playbooks/start",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  startSupportCasePlaybookController,
);

router.get(
  "/support/playbook-runs/:runId",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  getSupportPlaybookRunController,
);

router.patch(
  "/support/playbook-runs/:runId/steps/:stepId",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  updateSupportPlaybookStepController,
);

router.post(
  "/support/playbook-runs/:runId/complete",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  completeSupportPlaybookRunController,
);

router.get(
  "/support/alerts",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  listSupportAlertsController,
);

router.post(
  "/support/alerts/evaluate",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  evaluateSupportAlertsController,
);

router.get(
  "/support/alerts/:alertId",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  getSupportAlertController,
);

router.patch(
  "/support/alerts/:alertId",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  updateSupportAlertController,
);

/* =========================================================
   COFFER AI — SUPPORT CASE WORKSPACE

   These endpoints are exact-support only. The controller re-checks the
   authenticated DB role even though `protect` already ran.

   Important:
   - stores investigation/case workflow state only;
   - does not mutate payments, transactions, wallets, refunds or payouts;
   - automatic triage recommends a queue but never auto-escalates a
     financial/security case without a human Support action.
========================================================= */

router.get(
  "/support/cases",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  listSupportAiCasesController,
);

router.post(
  "/support/cases",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  createSupportAiCaseController,
);

router.get(
  "/support/cases/:caseId",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  getSupportAiCaseController,
);

router.patch(
  "/support/cases/:caseId",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  updateSupportAiCaseController,
);

router.post(
  "/support/cases/:caseId/notes",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  addSupportAiCaseNoteController,
);

router.get(
  "/support/cases/:caseId/timeline",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  getSupportAiCaseTimelineController,
);

router.get(
  "/support/cases/:caseId/correlation",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  getSupportAiCaseCorrelationController,
);

router.get(
  "/support/incidents",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  listSupportAiIncidentsController,
);

router.get(
  "/support/incidents/:incidentId",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  getSupportAiIncidentController,
);

router.patch(
  "/support/incidents/:incidentId",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  updateSupportAiIncidentController,
);



/* =========================================================
   COFFER AI — SUPPORT HEALTH / KNOWLEDGE LEARNING
========================================================= */

router.get(
  "/support/health",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  getSupportAiHealthController,
);

router.get(
  "/support/knowledge-drafts",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  listSupportKnowledgeDraftsController,
);

router.get(
  "/support/knowledge-drafts/:draftId",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  getSupportKnowledgeDraftController,
);

router.post(
  "/support/cases/:caseId/knowledge-draft",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  createSupportKnowledgeDraftController,
);

router.post(
  "/support/knowledge-drafts/:draftId/submit",
  protect,
  requireSupport,
  cofferAiRateLimiter,
  submitSupportKnowledgeDraftController,
);

/* =========================================================
   COFFER AI — HUMAN ADMIN KNOWLEDGE REVIEW
========================================================= */

router.get(
  "/support/admin/knowledge-drafts",
  protect,
  requireAdminOrSuperAdmin,
  cofferAiRateLimiter,
  listSupportKnowledgeDraftsController,
);

router.get(
  "/support/admin/knowledge-drafts/:draftId",
  protect,
  requireAdminOrSuperAdmin,
  cofferAiRateLimiter,
  getSupportKnowledgeDraftController,
);

router.patch(
  "/support/admin/knowledge-drafts/:draftId/review",
  protect,
  requireAdminOrSuperAdmin,
  cofferAiRateLimiter,
  reviewSupportKnowledgeDraftController,
);

router.post(
  "/support/admin/knowledge-drafts/:draftId/publish",
  protect,
  requireAdminOrSuperAdmin,
  cofferAiRateLimiter,
  publishSupportKnowledgeDraftController,
);

/* =========================================================
   COFFER AI — INTERNAL CRON
========================================================= */

router.post(
  "/internal/support-alerts/evaluate",
  requireCofferAiCron,
  runSupportAlertEvaluationInternalController,
);

router.post(
  "/internal/support-maintenance/run",
  requireCofferAiCron,
  runSupportMaintenanceInternalController,
);


export default router;
