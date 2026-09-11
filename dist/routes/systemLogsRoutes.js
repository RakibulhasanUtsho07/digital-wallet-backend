"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_js_1 = require("../middlewares/authMiddleware.js");
const adminAuthorization_js_1 = require("../middlewares/adminAuthorization.js");
const systemLogsController_js_1 = require("../controllers/systemLogsController.js");
const router = express_1.default.Router();
/* =========================================================
   ALL ROUTES ARE ADMIN ONLY
========================================================= */
router.use(authMiddleware_js_1.protect, adminAuthorization_js_1.requireAdmin);
/* =========================================================
   DASHBOARD DATA
========================================================= */
router.get("/summary", systemLogsController_js_1.getSystemLogsSummary);
router.get("/services", systemLogsController_js_1.getSystemServicesHealth);
router.get("/heatmap", systemLogsController_js_1.getSystemHeatmap);
router.get("/anomalies", systemLogsController_js_1.getSystemAnomalies);
/* =========================================================
   TRACE / CORRELATION
========================================================= */
router.get("/traces/:traceId", systemLogsController_js_1.getSystemTrace);
router.get("/root-cause/:requestId", systemLogsController_js_1.getSystemRootCause);
/* =========================================================
   EXPORT
========================================================= */
router.get("/export", systemLogsController_js_1.exportSystemLogs);
/* =========================================================
   LOG LIST / DETAIL
========================================================= */
router.get("/", systemLogsController_js_1.getSystemLogs);
router.get("/:id", systemLogsController_js_1.getSystemLogById);
exports.default = router;
