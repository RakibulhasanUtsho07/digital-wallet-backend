import express from "express";

import {
  getPlatformSettings,
  getPlatformSettingsAudit,
  resetPlatformSettings,
  updatePlatformSettings,
  verifyPlatformSettingsAudit,
} from "../controllers/platformSettingsController.js";

import {
  protect,
} from "../middlewares/authMiddleware.js";

import {
  requireAdmin,
} from "../middlewares/adminAuthorization.js";

import {
  adminSettingsReadLimiter,
  adminSettingsWriteLimiter,
  noStoreAdminResponse,
  requireJsonMutation,
  requireTrustedAdminOrigin,
} from "../middlewares/platformSettingsSecurity.js";

const router =
  express.Router();

/*
 * Every endpoint below is authenticated + admin-only.
 */
router.use(
  protect,
  requireAdmin,
  noStoreAdminResponse
);

/* =========================================================
   READ
========================================================= */

router.get(
  "/",
  adminSettingsReadLimiter,
  getPlatformSettings
);

router.get(
  "/audit",
  adminSettingsReadLimiter,
  getPlatformSettingsAudit
);

router.get(
  "/audit/verify",
  adminSettingsReadLimiter,
  verifyPlatformSettingsAudit
);

/* =========================================================
   PRIVILEGED MUTATIONS

   Additional protections:
   - trusted browser origin
   - JSON-only request
   - dedicated write rate limit
   - current admin password in controller
========================================================= */

router.patch(
  "/",
  requireTrustedAdminOrigin,
  requireJsonMutation,
  adminSettingsWriteLimiter,
  updatePlatformSettings
);

router.post(
  "/reset",
  requireTrustedAdminOrigin,
  requireJsonMutation,
  adminSettingsWriteLimiter,
  resetPlatformSettings
);

export default router;
