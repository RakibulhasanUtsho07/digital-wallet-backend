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
  getMerchantDashboardOrderController,
  listMerchantDashboardOrdersController,
} from "../controllers/merchantOrderController.js";
import {
  getMerchantPaymentDetailController,
} from "../controllers/merchantPaymentDetailController.js";
import {
  createMerchantController,
  getMyMerchantController,
  createMerchantApiKeyController,
  listMerchantApiKeysController,
  revokeMerchantApiKeyController,
  rotateMerchantApiKeyController,
} from "../controllers/merchantController.js";

import {
  getMerchantOverviewController,
} from "../controllers/merchantOverviewController.js";

import {
  getMerchantPaymentsController,
} from "../controllers/merchantPaymentsController.js";

const router =
  Router();

/* =========================================================
   CREATE MERCHANT
========================================================= */

router.post(
  "/",
  protect,
  createMerchantController
);

/* =========================================================
   MY MERCHANT
========================================================= */

router.get(
  "/me",
  protect,
  requireMerchant,
  getMyMerchantController
);

/* =========================================================
   MERCHANT OVERVIEW
========================================================= */

router.get(
  "/overview",
  protect,
  requireMerchant,
  getMerchantOverviewController
);

/* =========================================================
   MERCHANT PAYMENTS
========================================================= */

/*
 * GET /api/merchants/payments
 *
 * Supports:
 *
 * ?page=1
 * ?limit=20
 * ?search=pay_xxx
 * ?status=completed
 * ?mode=live
 * ?provider=damo_wallet
 * ?sourceType=wallet
 * ?from=2026-09-01
 * ?to=2026-09-11
 */

router.get(
  "/payments",
  protect,
  requireMerchant,
  getMerchantPaymentsController
);

/* =========================================================
   API KEYS
========================================================= */

router.post(
  "/api-keys",
  protect,
  requireMerchant,
  createMerchantApiKeyController
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
router.get(
  "/payments/:paymentId",
  protect,
  requireMerchant,
  getMerchantPaymentDetailController
);
router.get(
  "/api-keys",
  protect,
  requireMerchant,
  listMerchantApiKeysController
);

router.delete(
  "/api-keys/:keyId",
  protect,
  requireMerchant,
  revokeMerchantApiKeyController
);

router.post(
  "/api-keys/:keyId/rotate",
  protect,
  requireMerchant,
  rotateMerchantApiKeyController
);

export default router;