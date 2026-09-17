import express from "express";

import {
  protect,
} from "../middlewares/authMiddleware.js";

import {
  requireAdmin,
} from "../middlewares/adminAuthorization.js";

import {
  exportSystemLogs,
  getSystemAnomalies,
  getSystemHeatmap,
  getSystemLogById,
  getSystemLogs,
  getSystemLogsSummary,
  getSystemRootCause,
  getSystemServicesHealth,
  getSystemTrace,
} from "../controllers/systemLogsController.js";

const router =
  express.Router();

/* =========================================================
   ALL ROUTES ARE ADMIN ONLY
========================================================= */

router.use(
  protect,
  requireAdmin
);

/* =========================================================
   DASHBOARD DATA
========================================================= */

router.get(
  "/summary",
  getSystemLogsSummary
);

router.get(
  "/services",
  getSystemServicesHealth
);

router.get(
  "/heatmap",
  getSystemHeatmap
);

router.get(
  "/anomalies",
  getSystemAnomalies
);

/* =========================================================
   TRACE / CORRELATION
========================================================= */

router.get(
  "/traces/:traceId",
  getSystemTrace
);

router.get(
  "/root-cause/:requestId",
  getSystemRootCause
);

/* =========================================================
   EXPORT
========================================================= */

router.get(
  "/export",
  exportSystemLogs
);

/* =========================================================
   LOG LIST / DETAIL
========================================================= */

router.get(
  "/",
  getSystemLogs
);

router.get(
  "/:id",
  getSystemLogById
);

export default router;
