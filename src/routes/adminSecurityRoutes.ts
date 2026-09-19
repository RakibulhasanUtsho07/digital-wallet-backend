import express from "express";

import {
  getAdminIdentityRiskController,
  getAdminSecurityAuditController,
  getAdminSecurityEventsController,
  getAdminSecurityOverviewController,
  getAdminSecurityPoliciesController,
  getAdminSecuritySessionsController,
} from "../controllers/adminSecurityController.js";
import {
  requireAdminOrSuperAdmin,
} from "../middlewares/adminAuthorization.js";

import {
  protect,
} from "../middlewares/authMiddleware.js";
import {
  noStoreAdminResponse,
} from "../middlewares/platformSettingsSecurity.js";
import { adminSecurityReadLimiter } from "../middlewares/adminSecurityRateLimiters.js";

const router = express.Router();

router.use(
  protect,
  requireAdminOrSuperAdmin,
  noStoreAdminResponse,
  adminSecurityReadLimiter
);

router.get("/overview", getAdminSecurityOverviewController);
router.get("/events", getAdminSecurityEventsController);
router.get("/sessions", getAdminSecuritySessionsController);
router.get("/identities/risk", getAdminIdentityRiskController);
router.get("/policies", getAdminSecurityPoliciesController);
router.get("/audit", getAdminSecurityAuditController);

export default router;
