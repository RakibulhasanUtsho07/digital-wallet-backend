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
} from "../controllers/merchantWebhookController.js";

const router =
  Router();

/* =========================================================
   CREATE WEBHOOK
 *
 * POST /api/v1/webhooks/endpoints
 *
 * Scope:
 * webhooks:manage
========================================================= */

router.post(
  "/endpoints",
  merchantApiAuth(
    "webhooks:manage"
  ),
  createMerchantWebhookEndpointController
);

/* =========================================================
   LIST WEBHOOKS
 *
 * GET /api/v1/webhooks
 *
 * Scope:
 * webhooks:manage
========================================================= */

router.get(
  "/",
  merchantApiAuth(
    "webhooks:manage"
  ),
  listMerchantWebhookEndpointsController
);

/* =========================================================
   DELETE WEBHOOK
 *
 * DELETE /api/v1/webhooks/:id
========================================================= */

router.delete(
  "/:id",
  merchantApiAuth(
    "webhooks:manage"
  ),
  deleteMerchantWebhookEndpointController
);

export default router;