import express from "express";

import {
  getSupportSettings,
  getSupportSettingsAudit,
  updateSupportSettingsSection,
} from "../controllers/supportSettingsController.js";

import {
  protect,
} from "../middlewares/authMiddleware.js";

import {
  requireSupport,
} from "../middlewares/adminAuthorization.js";
import { noStoreSupportSettings, requireSupportSettingsJson, requireTrustedSupportOrigin, supportSettingsReadLimiter, supportSettingsWriteLimiter } from "../middlewares/supportSettingsSecurity.js";



const router =
  express.Router();

router.use(
  protect,
  requireSupport,
  noStoreSupportSettings
);

router.get(
  "/",
  supportSettingsReadLimiter,
  getSupportSettings
);

router.get(
  "/audit",
  supportSettingsReadLimiter,
  getSupportSettingsAudit
);

router.patch(
  "/:section",
  requireTrustedSupportOrigin,
  requireSupportSettingsJson,
  supportSettingsWriteLimiter,
  updateSupportSettingsSection
);

export default router;




