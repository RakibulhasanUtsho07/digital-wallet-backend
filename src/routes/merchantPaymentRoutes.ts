import {
  Router,
} from "express";

import {
  protect,
} from "../middlewares/authMiddleware.js";

import {
  merchantApiAuth,
} from "../middlewares/merchantAuth.js";

import {
  createMerchantPaymentController,
  getMerchantPaymentController,
  getCustomerCheckoutPaymentController,
  confirmMerchantWalletPaymentController,
} from "../controllers/merchantPaymentController.js";

const router =
  Router();

/* =========================================================
   CREATE PAYMENT
 *
 * POST /api/v1/payments
 *
 * Merchant API key
 * Scope: payments:write
========================================================= */

router.post(
  "/",
  merchantApiAuth(
    "payments:write"
  ),
  createMerchantPaymentController
);

/* =========================================================
   CUSTOMER CHECKOUT
 *
 * GET /api/v1/payments/:paymentId/checkout
 *
 * DAMO authenticated customer
========================================================= */

router.get(
  "/:paymentId/checkout",
  protect,
  getCustomerCheckoutPaymentController
);

/* =========================================================
   CUSTOMER CONFIRM
 *
 * POST /api/v1/payments/:paymentId/confirm
 *
 * DAMO authenticated customer
========================================================= */

router.post(
  "/:paymentId/confirm",
  protect,
  confirmMerchantWalletPaymentController
);

/* =========================================================
   GET MERCHANT PAYMENT
 *
 * GET /api/v1/payments/:paymentId
 *
 * Merchant API key
 * Scope: payments:read
========================================================= */

router.get(
  "/:paymentId",
  merchantApiAuth(
    "payments:read"
  ),
  getMerchantPaymentController
);

export default router;