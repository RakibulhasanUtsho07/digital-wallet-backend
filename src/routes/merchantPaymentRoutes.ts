import {
  Router,
} from "express";

import {
  protect,
} from "../middlewares/authMiddleware.js";

import {
  requireVerifiedKYC,
} from "../middlewares/kycMiddleware.js";

import {
  merchantApiAuth,
} from "../middlewares/merchantAuth.js";

import {
  securityReadLimiter,
  securitySensitiveLimiter,
} from "../middlewares/securityRateLimiters.js";

import {
  createMerchantPaymentController,
  getMerchantPaymentController,
  getCustomerCheckoutPaymentController,
  confirmMerchantWalletPaymentController,
} from "../controllers/merchantPaymentController.js";

const router =
  Router();

/* =========================================================
   CREATE COFFER PAYMENT

   POST /api/v1/payments

   Required:
   - Merchant Secret API Key
   - payments:write scope
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

   GET /api/v1/payments/:paymentId/checkout

   Required:
   - Authenticated Coffer customer
========================================================= */

router.get(
  "/:paymentId/checkout",

  protect,

  securityReadLimiter,

  getCustomerCheckoutPaymentController
);

/* =========================================================
   CONFIRM COFFER PAYMENT

   POST /api/v1/payments/:paymentId/confirm

   Required:
   - Authenticated customer
   - Verified KYC
   - Passkey authorization token
========================================================= */

router.post(
  "/:paymentId/confirm",

  protect,

  requireVerifiedKYC,

  securitySensitiveLimiter,

  confirmMerchantWalletPaymentController
);

/* =========================================================
   GET PAYMENT FOR MERCHANT

   GET /api/v1/payments/:paymentId

   Required:
   - Merchant Secret API Key
   - payments:read scope
========================================================= */

router.get(
  "/:paymentId",

  merchantApiAuth(
    "payments:read"
  ),

  getMerchantPaymentController
);

export default router;