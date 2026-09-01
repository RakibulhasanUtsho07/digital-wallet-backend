import express from "express";

import {
  protect,
} from "../middlewares/authMiddleware.js";

import {
  requireAdmin,
} from "../middlewares/adminAuthorization.js";

import {
  analyticsExportLimiter,
  analyticsReadLimiter,
  analyticsReportLimiter,
} from "../middlewares/analyticsRateLimiters.js";

import {
  createAnalyticsReportController,
  downloadAnalyticsReportController,
  exportAnalyticsController,
  getAnalyticsDashboardController,
  getAnalyticsReportController,
} from "../controllers/analyticsController.js";

const router =
  express.Router();

/* =========================================================
   ADMIN AUTHORIZATION
========================================================= */

router.use(
  protect,
  requireAdmin
);

/* =========================================================
   NO-STORE
========================================================= */

router.use(
  (
    _req,
    res,
    next
  ) => {
    res.setHeader(
      "Cache-Control",
      "no-store"
    );

    next();
  }
);

/* =========================================================
   DASHBOARD
========================================================= */

router.get(
  "/dashboard",
  analyticsReadLimiter,
  getAnalyticsDashboardController
);

/* =========================================================
   EXPORT
========================================================= */

router.get(
  "/export",
  analyticsExportLimiter,
  exportAnalyticsController
);

/* =========================================================
   REPORTS
========================================================= */

router.post(
  "/reports",
  analyticsReportLimiter,
  createAnalyticsReportController
);

router.get(
  "/reports/:id",
  analyticsReadLimiter,
  getAnalyticsReportController
);

router.get(
  "/reports/:id/download",
  analyticsExportLimiter,
  downloadAnalyticsReportController
);

export default router;
