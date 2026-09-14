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
  parseMerchantVerificationDocuments,
} from "../middlewares/merchantVerificationUpload.js";

import {
  getMyMerchantController,
} from "../controllers/merchantController.js";

import {
  completeMerchantOnboardingController,
  getMerchantOnboardingStatusController,
} from "../controllers/merchantOnboardingController.js";

import {
  createMerchantApiKeyController,
  listMerchantApiKeysController,
  revokeMerchantApiKeyController,
  rotateMerchantApiKeyController,
} from "../controllers/merchantDashboardApiKeyController.js";

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
  getMerchantReportController,
} from "../controllers/merchantReportController.js";

const router =
  Router();

/* =========================================================
   CREATE MERCHANT

   POST /api/merchants
========================================================= */

router.post(
  "/",
  protect,
  securitySensitiveLimiter,
  completeMerchantOnboardingController
);

/* =========================================================
   MERCHANT AUTH / ONBOARDING STATUS

   GET /api/merchants/onboarding-status

   This route must not use requireMerchant because a normal
   authenticated user calls it before becoming a merchant.
========================================================= */

router.get(
  "/onboarding-status",
  protect,
  securityReadLimiter,
  getMerchantOnboardingStatusController
);

/* =========================================================
   MY MERCHANT

   GET /api/merchants/me
========================================================= */

router.get(
  "/me",
  protect,
  requireMerchant,
  getMyMerchantController
);

/* =========================================================
   MERCHANT OVERVIEW

   GET /api/merchants/overview
========================================================= */

router.get(
  "/overview",
  protect,
  requireMerchant,
  getMerchantOverviewController
);

/* =========================================================
   MERCHANT VERIFICATION / KYB

   The owner must complete NID/e-KYC before submitting
   business documents. Live API access remains locked until
   an administrator approves the business verification.
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
   MERCHANT PAYMENTS
========================================================= */

router.get(
  "/payments",
  protect,
  requireMerchant,
  getMerchantPaymentsController
);

router.get(
  "/payments/:paymentId",
  protect,
  requireMerchant,
  getMerchantPaymentDetailController
);

/* =========================================================
   MERCHANT GATEWAY ORDERS
========================================================= */

router.get(
  "/orders",
  protect,
  requireMerchant,
  listMerchantDashboardOrdersController
);

router.get(
  "/orders/:orderId",
  protect,
  requireMerchant,
  getMerchantDashboardOrderController
);

/* =========================================================
   MERCHANT SANDBOX

   These dashboard-session endpoints create and read only
   test-mode orders. The mode cannot be changed by input.
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
   MERCHANT CUSTOMERS
========================================================= */

router.get(
  "/customers",
  protect,
  requireMerchant,
  getMerchantCustomersController
);

router.get(
  "/customers/:customerId",
  protect,
  requireMerchant,
  getMerchantCustomerDetailController
);

/* =========================================================
   MERCHANT REFUNDS
========================================================= */

router.get(
  "/refunds",
  protect,
  requireMerchant,
  listMerchantRefundsController
);

router.get(
  "/refunds/:refundId",
  protect,
  requireMerchant,
  getMerchantDashboardRefundController
);

/* =========================================================
   MERCHANT TRANSACTIONS
========================================================= */

router.get(
  "/transactions",
  protect,
  requireMerchant,
  listMerchantTransactionsController
);

router.get(
  "/transactions/:transactionId",
  protect,
  requireMerchant,
  getMerchantTransactionController
);

/* =========================================================
   MERCHANT REPORTS
========================================================= */

router.get(
  "/reports",
  protect,
  requireMerchant,
  getMerchantReportController
);

/* =========================================================
   MERCHANT API KEYS

   Test keys are available before KYB approval. Creating,
   rotating, and using live keys requires verified owner
   e-KYC plus approved merchant business verification.
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

export default router;
