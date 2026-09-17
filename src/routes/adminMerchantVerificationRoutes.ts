import {
  Router,
} from "express";

import {
  protect,
} from "../middlewares/authMiddleware.js";

import {
  requireAdmin,
} from "../middlewares/adminAuthorization.js";

import {
  securityReadLimiter,
  securitySensitiveLimiter,
} from "../middlewares/securityRateLimiters.js";

import {
  approveMerchantVerificationController,
  getAdminMerchantVerificationController,
  listAdminMerchantVerificationsController,
  rejectMerchantVerificationController,
} from "../controllers/adminMerchantVerificationController.js";

const router =
  Router();

/* =========================================================
   ADMIN MERCHANT VERIFICATION

   Mount at:
   /api/admin/merchant-verifications
========================================================= */

router.get(
  "/",
  protect,
  requireAdmin,
  securityReadLimiter,
  listAdminMerchantVerificationsController
);

router.get(
  "/:verificationId",
  protect,
  requireAdmin,
  securityReadLimiter,
  getAdminMerchantVerificationController
);

router.post(
  "/:verificationId/approve",
  protect,
  requireAdmin,
  securitySensitiveLimiter,
  approveMerchantVerificationController
);

router.post(
  "/:verificationId/reject",
  protect,
  requireAdmin,
  securitySensitiveLimiter,
  rejectMerchantVerificationController
);

export default router;

