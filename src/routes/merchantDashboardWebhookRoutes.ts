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
  createMerchantDashboardWebhookController,
  disableMerchantDashboardWebhookController,
  listMerchantDashboardWebhookEventsController,
  listMerchantDashboardWebhooksController,
  retryMerchantDashboardWebhookEventController,
  rotateMerchantDashboardWebhookSecretController,
} from "../controllers/merchantDashboardWebhookController.js";

const router = Router();

/* =========================================================
   SESSION-PROTECTED MERCHANT DASHBOARD ROUTES
========================================================= */

router.get(
  "/webhooks",
  protect,
  requireMerchant,
  securityReadLimiter,
  listMerchantDashboardWebhooksController
);

router.post(
  "/webhooks",
  protect,
  requireMerchant,
  securitySensitiveLimiter,
  createMerchantDashboardWebhookController
);

router.post(
  "/webhooks/:endpointId/rotate-secret",
  protect,
  requireMerchant,
  securitySensitiveLimiter,
  rotateMerchantDashboardWebhookSecretController
);

router.delete(
  "/webhooks/:endpointId",
  protect,
  requireMerchant,
  securitySensitiveLimiter,
  disableMerchantDashboardWebhookController
);

router.get(
  "/webhook-events",
  protect,
  requireMerchant,
  securityReadLimiter,
  listMerchantDashboardWebhookEventsController
);

router.post(
  "/webhook-events/:eventId/retry",
  protect,
  requireMerchant,
  securitySensitiveLimiter,
  retryMerchantDashboardWebhookEventController
);

export default router;
