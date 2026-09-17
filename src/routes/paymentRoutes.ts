import {
  Router,
} from "express";

import {
  addMoney,
  validatePaymentSource,
} from "../controllers/paymentController.js";

import {
  protect,
} from "../middlewares/authMiddleware.js";

import {
  requireVerifiedKYC,
} from "../middlewares/kycMiddleware.js";

import {
  securityReadLimiter,
  securitySensitiveLimiter,
} from "../middlewares/securityRateLimiters.js";

const router =
  Router();

/* =========================================================
   VALIDATE PAYMENT SOURCE

   POST /api/payment/validate-source
========================================================= */

router.post(
  "/validate-source",

  protect,

  securityReadLimiter,

  validatePaymentSource
);

/* =========================================================
   ADD MONEY

   POST /api/payment/add-money
========================================================= */

router.post(
  "/add-money",

  protect,

  requireVerifiedKYC,

  securitySensitiveLimiter,

  addMoney
);

export default router;