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
import {
  requireWalletNotFrozen,
} from "../middlewares/walletSecurityMiddleware.js";

const router =
  Router();

/* =========================================================
   VALIDATE PAYMENT SOURCE

   POST /api/payment/validate-source
========================================================= */

router.post(
  "/validate-source",

  protect,

  requireWalletNotFrozen,

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

  requireWalletNotFrozen,

  securitySensitiveLimiter,

  addMoney
);

export default router;
