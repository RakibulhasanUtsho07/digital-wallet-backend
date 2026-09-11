"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_js_1 = require("../middlewares/authMiddleware.js");
const adminAuthorization_js_1 = require("../middlewares/adminAuthorization.js");
const analyticsRateLimiters_js_1 = require("../middlewares/analyticsRateLimiters.js");
const analyticsController_js_1 = require("../controllers/analyticsController.js");
const router = express_1.default.Router();
/* =========================================================
   ADMIN AUTHORIZATION
========================================================= */
router.use(authMiddleware_js_1.protect, adminAuthorization_js_1.requireAdmin);
/* =========================================================
   NO-STORE
========================================================= */
router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
});
/* =========================================================
   DASHBOARD
========================================================= */
router.get("/dashboard", analyticsRateLimiters_js_1.analyticsReadLimiter, analyticsController_js_1.getAnalyticsDashboardController);
/* =========================================================
   EXPORT
========================================================= */
router.get("/export", analyticsRateLimiters_js_1.analyticsExportLimiter, analyticsController_js_1.exportAnalyticsController);
/* =========================================================
   REPORTS
========================================================= */
router.post("/reports", analyticsRateLimiters_js_1.analyticsReportLimiter, analyticsController_js_1.createAnalyticsReportController);
router.get("/reports/:id", analyticsRateLimiters_js_1.analyticsReadLimiter, analyticsController_js_1.getAnalyticsReportController);
router.get("/reports/:id/download", analyticsRateLimiters_js_1.analyticsExportLimiter, analyticsController_js_1.downloadAnalyticsReportController);
exports.default = router;
