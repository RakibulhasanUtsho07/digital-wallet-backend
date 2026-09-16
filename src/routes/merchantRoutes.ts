import {
  Router,
} from "express";

import {
  protect,
} from "../middlewares/authMiddleware.js";

import {
  requireMerchant,
} from "../middlewares/adminAuthorization.js";

import {
  securityReadLimiter,
  securitySensitiveLimiter,
} from "../middlewares/securityRateLimiters.js";

import {
  merchantAiRateLimiter,
} from "../middlewares/merchantAiRateLimiter.js";

import {
  parseMerchantVerificationDocuments,
} from "../middlewares/merchantVerificationUpload.js";

/* =========================================================
   CONTROLLERS
========================================================= */

import {
  getMyMerchantController,
} from "../controllers/merchantController.js";

import {
  completeMerchantOnboardingController,
  getMerchantOnboardingStatusController,
} from "../controllers/merchantOnboardingController.js";

import {
  getMerchantVerificationController,
  submitMerchantVerificationController,
} from "../controllers/merchantVerificationController.js";

import {
  getMerchantOverviewController,
} from "../controllers/merchantOverviewController.js";

import {
  getMerchantPaymentsController,
} from "../controllers/merchantPaymentsController.js";

import {
  getMerchantPaymentDetailController,
} from "../controllers/merchantPaymentDetailController.js";

import {
  getMerchantDashboardOrderController,
  listMerchantDashboardOrdersController,
} from "../controllers/merchantOrderController.js";

import {
  createMerchantSandboxOrderController,
  getMerchantSandboxOrderController,
  listMerchantSandboxOrdersController,
} from "../controllers/merchantSandboxController.js";

import {
  getMerchantCustomersController,
} from "../controllers/merchantCustomersController.js";

import {
  getMerchantCustomerDetailController,
} from "../controllers/merchantCustomerDetailController.js";

import {
  getMerchantDashboardRefundController,
  listMerchantRefundsController,
} from "../controllers/merchantRefundController.js";

import {
  getMerchantTransactionController,
  listMerchantTransactionsController,
} from "../controllers/merchantTransactionController.js";

import {
  createMerchantPayoutController,
  getMerchantPayoutController,
  listMerchantPayoutsController,
} from "../controllers/merchantPayoutController.js";

import {
  createMerchantSettlementController,
  getMerchantSettlementController,
  listMerchantSettlementsController,
} from "../controllers/merchantSettlementController.js";

import {
  getMerchantDisputesController,
} from "../controllers/merchantDisputesController.js";

import {
  getMerchantDisputeDetailController,
} from "../controllers/merchantDisputeDetailController.js";

/*
 * NEW
 */
import {
  getMerchantAnalyticsController,
} from "../controllers/merchantAnalyticsController.js";

import {
  getMerchantReportController,
} from "../controllers/merchantReportController.js";

import {
  createMerchantApiKeyController,
  listMerchantApiKeysController,
  revokeMerchantApiKeyController,
  rotateMerchantApiKeyController,
} from "../controllers/merchantDashboardApiKeyController.js";

import {
  getMerchantAiContextController,
  merchantAiChatController,
} from "../controllers/merchantAiAssistantController.js";

/* =========================================================
   ROUTER
========================================================= */

const router =
  Router();

/* =========================================================
   CREATE MERCHANT
========================================================= */

router.post(
  "/",
  protect,
  securitySensitiveLimiter,
  completeMerchantOnboardingController
);

/* =========================================================
   ONBOARDING
========================================================= */

router.get(
  "/onboarding-status",
  protect,
  securityReadLimiter,
  getMerchantOnboardingStatusController
);

/* =========================================================
   MY MERCHANT
========================================================= */

router.get(
  "/me",
  protect,
  requireMerchant,
  securityReadLimiter,
  getMyMerchantController
);

/* =========================================================
   OVERVIEW
========================================================= */

router.get(
  "/overview",
  protect,
  requireMerchant,
  securityReadLimiter,
  getMerchantOverviewController
);

/* =========================================================
   VERIFICATION
========================================================= */

router.get(
  "/verification",
  protect,
  requireMerchant,
  securityReadLimiter,
  getMerchantVerificationController
);

router.post(
  "/verification/submit",
  protect,
  requireMerchant,
  securitySensitiveLimiter,
  parseMerchantVerificationDocuments,
  submitMerchantVerificationController
);

/* =========================================================
   PAYMENTS
========================================================= */

router.get(
  "/payments",
  protect,
  requireMerchant,
  securityReadLimiter,
  getMerchantPaymentsController
);

router.get(
  "/payments/:paymentId",
  protect,
  requireMerchant,
  securityReadLimiter,
  getMerchantPaymentDetailController
);

/* =========================================================
   ORDERS
========================================================= */

router.get(
  "/orders",
  protect,
  requireMerchant,
  securityReadLimiter,
  listMerchantDashboardOrdersController
);

router.get(
  "/orders/:orderId",
  protect,
  requireMerchant,
  securityReadLimiter,
  getMerchantDashboardOrderController
);

/* =========================================================
   SANDBOX
========================================================= */

router.post(
  "/sandbox/orders",
  protect,
  requireMerchant,
  securitySensitiveLimiter,
  createMerchantSandboxOrderController
);

router.get(
  "/sandbox/orders",
  protect,
  requireMerchant,
  securityReadLimiter,
  listMerchantSandboxOrdersController
);

router.get(
  "/sandbox/orders/:orderId",
  protect,
  requireMerchant,
  securityReadLimiter,
  getMerchantSandboxOrderController
);

/* =========================================================
   CUSTOMERS
========================================================= */

router.get(
  "/customers",
  protect,
  requireMerchant,
  securityReadLimiter,
  getMerchantCustomersController
);

router.get(
  "/customers/:customerId",
  protect,
  requireMerchant,
  securityReadLimiter,
  getMerchantCustomerDetailController
);

/* =========================================================
   REFUNDS
========================================================= */

router.get(
  "/refunds",
  protect,
  requireMerchant,
  securityReadLimiter,
  listMerchantRefundsController
);

router.get(
  "/refunds/:refundId",
  protect,
  requireMerchant,
  securityReadLimiter,
  getMerchantDashboardRefundController
);

/* =========================================================
   TRANSACTIONS
========================================================= */

router.get(
  "/transactions",
  protect,
  requireMerchant,
  securityReadLimiter,
  listMerchantTransactionsController
);

router.get(
  "/transactions/:transactionId",
  protect,
  requireMerchant,
  securityReadLimiter,
  getMerchantTransactionController
);

/* =========================================================
   PAYOUTS
========================================================= */

router.get(
  "/payouts",
  protect,
  requireMerchant,
  securityReadLimiter,
  listMerchantPayoutsController
);

router.post(
  "/payouts",
  protect,
  requireMerchant,
  securitySensitiveLimiter,
  createMerchantPayoutController
);

router.get(
  "/payouts/:payoutId",
  protect,
  requireMerchant,
  securityReadLimiter,
  getMerchantPayoutController
);

/* =========================================================
   SETTLEMENTS
========================================================= */

router.get(
  "/settlements",
  protect,
  requireMerchant,
  securityReadLimiter,
  listMerchantSettlementsController
);

router.post(
  "/settlements",
  protect,
  requireMerchant,
  securitySensitiveLimiter,
  createMerchantSettlementController
);

router.get(
  "/settlements/:settlementId",
  protect,
  requireMerchant,
  securityReadLimiter,
  getMerchantSettlementController
);

/* =========================================================
   DISPUTES
========================================================= */

router.get(
  "/disputes",
  protect,
  requireMerchant,
  securityReadLimiter,
  getMerchantDisputesController
);

router.get(
  "/disputes/:disputeId",
  protect,
  requireMerchant,
  securityReadLimiter,
  getMerchantDisputeDetailController
);

/* =========================================================
   ANALYTICS

   GET /api/merchants/analytics
========================================================= */

router.get(
  "/analytics",
  protect,
  requireMerchant,
  securityReadLimiter,
  getMerchantAnalyticsController
);

/* =========================================================
   REPORTS
========================================================= */

router.get(
  "/reports",
  protect,
  requireMerchant,
  securityReadLimiter,
  getMerchantReportController
);

/* =========================================================
   API KEYS
========================================================= */

router.post(
  "/api-keys",
  protect,
  requireMerchant,
  securitySensitiveLimiter,
  createMerchantApiKeyController
);

router.get(
  "/api-keys",
  protect,
  requireMerchant,
  securityReadLimiter,
  listMerchantApiKeysController
);

router.delete(
  "/api-keys/:keyId",
  protect,
  requireMerchant,
  securitySensitiveLimiter,
  revokeMerchantApiKeyController
);

router.post(
  "/api-keys/:keyId/rotate",
  protect,
  requireMerchant,
  securitySensitiveLimiter,
  rotateMerchantApiKeyController
);

/* =========================================================
   AI ASSISTANT
========================================================= */

router.get(
  "/ai-assistant/context",
  protect,
  requireMerchant,
  securityReadLimiter,
  getMerchantAiContextController
);

router.post(
  "/ai-assistant/chat",
  protect,
  requireMerchant,
  merchantAiRateLimiter,
  merchantAiChatController
);

/* =========================================================
   EXPORT
========================================================= */

export default router;