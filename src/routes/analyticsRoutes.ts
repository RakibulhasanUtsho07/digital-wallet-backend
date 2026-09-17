import {
  Router,
} from "express";

import {
  protect,
} from "../middlewares/authMiddleware.js";

import {
  requireAnalyticsAccess,
} from "../middlewares/adminAuthorization.js";

import {
  securityReadLimiter,
} from "../middlewares/securityRateLimiters.js";

import {
  getAnalystOverviewController,
} from "../controllers/analystOverviewController.js";

import {
  getAnalystLivePulseController,
} from "../controllers/analystLivePulseController.js";

const router =
  Router();

/* =========================================================
   COMMON ANALYST PROTECTION

   Read-only access:
   - analyst
   - admin
   - super_admin
========================================================= */

router.use(
  protect,
  requireAnalyticsAccess,
  securityReadLimiter
);

router.use(
  (
    _req,
    res,
    next
  ) => {
    res.setHeader(
      "Cache-Control",
      "private, no-store, max-age=0"
    );

    next();
  }
);

/* =========================================================
   ANALYST EXECUTIVE OVERVIEW

   GET /api/analyst/overview
========================================================= */

router.get(
  "/overview",
  getAnalystOverviewController
);

/* =========================================================
   LIVE PLATFORM PULSE

   GET /api/analyst/live-pulse
========================================================= */

router.get(
  "/live-pulse",
  getAnalystLivePulseController
);

export default router;
