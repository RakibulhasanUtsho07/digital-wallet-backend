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

/* =========================================================
   ROUTER
========================================================= */

const router =
  Router();

/* =========================================================
   MERCHANT DASHBOARD WEBHOOK ROUTES

   Mounted in app.ts:

   app.use(
     "/api/merchants",
     merchantDashboardWebhookRoutes
   );

   Final browser endpoints:

   GET    /api/merchants/webhooks
   POST   /api/merchants/webhooks
   POST   /api/merchants/webhooks/:endpointId/rotate-secret
   DELETE /api/merchants/webhooks/:endpointId

   GET    /api/merchants/webhook-events
   POST   /api/merchants/webhook-events/:eventId/retry

   Authentication:
   - Normal Coffer merchant session
   - NOT Merchant API key authentication
========================================================= */

/* =========================================================
   LIST WEBHOOK ENDPOINTS

   GET:
   /api/merchants/webhooks?environment=test

   /api/merchants/webhooks?environment=live
========================================================= */

router.get(
  "/webhooks",

  protect,

  requireMerchant,

  securityReadLimiter,

  listMerchantDashboardWebhooksController,
);

/* =========================================================
   CREATE WEBHOOK ENDPOINT

   POST:
   /api/merchants/webhooks

   Body example:

   {
     "url": "https://merchant.example.com/api/coffer-webhook",
     "environment": "test",
     "events": [
       "payment.completed",
       "payment.failed"
     ],
     "description": "Test payment webhook"
   }
========================================================= */

router.post(
  "/webhooks",

  protect,

  requireMerchant,

  securitySensitiveLimiter,

  createMerchantDashboardWebhookController,
);

/* =========================================================
   ROTATE WEBHOOK SIGNING SECRET

   POST:
   /api/merchants/webhooks/:endpointId/rotate-secret

   Body:

   {
     "environment": "test"
   }
========================================================= */

router.post(
  "/webhooks/:endpointId/rotate-secret",

  protect,

  requireMerchant,

  securitySensitiveLimiter,

  rotateMerchantDashboardWebhookSecretController,
);

/* =========================================================
   DISABLE WEBHOOK ENDPOINT

   DELETE:
   /api/merchants/webhooks/:endpointId?environment=test

   We intentionally disable the endpoint instead of
   permanently deleting its historical delivery records.
========================================================= */

router.delete(
  "/webhooks/:endpointId",

  protect,

  requireMerchant,

  securitySensitiveLimiter,

  disableMerchantDashboardWebhookController,
);

/* =========================================================
   LIST WEBHOOK DELIVERY EVENTS

   GET:
   /api/merchants/webhook-events?environment=test

   Optional filters:

   ?environment=test
   &status=failed
   &page=1
   &limit=20
========================================================= */

router.get(
  "/webhook-events",

  protect,

  requireMerchant,

  securityReadLimiter,

  listMerchantDashboardWebhookEventsController,
);

/* =========================================================
   RETRY WEBHOOK DELIVERY

   POST:
   /api/merchants/webhook-events/:eventId/retry

   Body:

   {
     "environment": "test"
   }
========================================================= */

router.post(
  "/webhook-events/:eventId/retry",

  protect,

  requireMerchant,

  securitySensitiveLimiter,

  retryMerchantDashboardWebhookEventController,
);

/* =========================================================
   EXPORT
========================================================= */

export default router;