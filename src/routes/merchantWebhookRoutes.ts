import {
  Router,
} from "express";

import {
  merchantApiAuth,
} from "../middlewares/merchantAuth.js";

import {
  createMerchantWebhookEndpointController,
  deleteMerchantWebhookEndpointController,
  listMerchantWebhookEndpointsController,
  listMerchantWebhookEventsController,
  retryMerchantWebhookEventController,
  rotateMerchantWebhookSecretController,
} from "../controllers/merchantWebhookController.js";

const router =
  Router();

/* =========================================================
   CREATE ENDPOINT
========================================================= */

router.post(
  "/endpoints",
  merchantApiAuth(
    "webhooks:manage"
  ),
  createMerchantWebhookEndpointController
);

/* =========================================================
   LIST DELIVERY EVENTS

   Must be declared before /:id routes.
========================================================= */

router.get(
  "/events",
  merchantApiAuth(
    "webhooks:manage"
  ),
  listMerchantWebhookEventsController
);

/* =========================================================
   RETRY DELIVERY
========================================================= */

router.post(
  "/events/:eventId/retry",
  merchantApiAuth(
    "webhooks:manage"
  ),
  retryMerchantWebhookEventController
);

/* =========================================================
   LIST ENDPOINTS
========================================================= */

router.get(
  "/",
  merchantApiAuth(
    "webhooks:manage"
  ),
  listMerchantWebhookEndpointsController
);

/* =========================================================
   ROTATE SECRET
========================================================= */

router.post(
  "/:id/rotate-secret",
  merchantApiAuth(
    "webhooks:manage"
  ),
  rotateMerchantWebhookSecretController
);

/* =========================================================
   DISABLE ENDPOINT
========================================================= */

router.delete(
  "/:id",
  merchantApiAuth(
    "webhooks:manage"
  ),
  deleteMerchantWebhookEndpointController
);

export default router;