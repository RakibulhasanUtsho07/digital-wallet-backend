"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadAnalyticsReportController = exports.getAnalyticsReportController = exports.createAnalyticsReportController = exports.exportAnalyticsController = exports.getAnalyticsDashboardController = void 0;
const analyticsAggregationService_js_1 = require("../services/analyticsAggregationService.js");
const analyticsReportService_js_1 = require("../services/analyticsReportService.js");
const analyticsRangeService_js_1 = require("../services/analyticsRangeService.js");
/* =========================================================
   HELPERS
========================================================= */
const asString = (value) => {
    if (typeof value ===
        "string") {
        return value;
    }
    if (Array.isArray(value)) {
        const first = value[0];
        return typeof first ===
            "string"
            ? first
            : "";
    }
    return "";
};
const getAdminId = (req, res) => {
    const adminId = req.user
        ?._id;
    if (!adminId) {
        res.status(401).json({
            success: false,
            message: "Authentication is required.",
        });
        return null;
    }
    return adminId;
};
const parseReportFormat = (value) => {
    const format = asString(value);
    if (format ===
        "summary" ||
        format ===
            "executive" ||
        format ===
            "risk") {
        return format;
    }
    return null;
};
/* =========================================================
   GET DASHBOARD
   GET /api/admin/analytics/dashboard
========================================================= */
const getAnalyticsDashboardController = async (req, res) => {
    try {
        const range = (0, analyticsRangeService_js_1.parseAnalyticsRange)(req.query
            .range);
        const forceFresh = asString(req.query
            .refresh) ===
            "1";
        const dashboard = await (0, analyticsAggregationService_js_1.getAnalyticsDashboard)({
            range,
            forceFresh,
        });
        res.setHeader("Cache-Control", "no-store");
        res.status(200).json({
            success: true,
            dashboard,
        });
    }
    catch (error) {
        console.error("GET ANALYTICS DASHBOARD ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Unable to load analytics dashboard.",
        });
    }
};
exports.getAnalyticsDashboardController = getAnalyticsDashboardController;
/* =========================================================
   EXPORT
   GET /api/admin/analytics/export
========================================================= */
const exportAnalyticsController = async (req, res) => {
    try {
        const range = (0, analyticsRangeService_js_1.parseAnalyticsRange)(req.query
            .range);
        const format = asString(req.query
            .format) ||
            "csv";
        if (format !==
            "csv") {
            res.status(400).json({
                success: false,
                message: "Only CSV export is currently supported.",
            });
            return;
        }
        const dashboard = await (0, analyticsAggregationService_js_1.getAnalyticsDashboard)({
            range,
            forceFresh: false,
        });
        const csv = (0, analyticsReportService_js_1.analyticsDashboardToCsv)(dashboard);
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="analytics-${range.toLowerCase()}-${new Date()
            .toISOString()
            .slice(0, 10)}.csv"`);
        res.status(200).send(csv);
    }
    catch (error) {
        console.error("EXPORT ANALYTICS ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Unable to export analytics.",
        });
    }
};
exports.exportAnalyticsController = exportAnalyticsController;
/* =========================================================
   CREATE REPORT
   POST /api/admin/analytics/reports
========================================================= */
const createAnalyticsReportController = async (req, res) => {
    const adminId = getAdminId(req, res);
    if (!adminId) {
        return;
    }
    const range = (0, analyticsRangeService_js_1.parseAnalyticsRange)(req.body
        ?.range);
    const format = parseReportFormat(req.body
        ?.format);
    if (!format) {
        res.status(400).json({
            success: false,
            message: "Report format must be summary, executive, or risk.",
        });
        return;
    }
    try {
        const report = await (0, analyticsReportService_js_1.createAnalyticsReport)({
            adminId,
            range,
            format,
        });
        res.setHeader("Cache-Control", "no-store");
        res.status(201).json({
            success: true,
            report: {
                id: report._id.toString(),
                status: report.status,
            },
        });
    }
    catch (error) {
        console.error("CREATE ANALYTICS REPORT ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Unable to generate analytics report.",
        });
    }
};
exports.createAnalyticsReportController = createAnalyticsReportController;
/* =========================================================
   GET REPORT
   GET /api/admin/analytics/reports/:id
========================================================= */
const getAnalyticsReportController = async (req, res) => {
    const adminId = getAdminId(req, res);
    if (!adminId) {
        return;
    }
    try {
        const report = await (0, analyticsReportService_js_1.getAnalyticsReport)({
            reportId: asString(req.params
                .id),
            adminId,
        });
        if (!report) {
            res.status(404).json({
                success: false,
                message: "Analytics report not found or expired.",
            });
            return;
        }
        res.setHeader("Cache-Control", "no-store");
        res.status(200).json({
            success: true,
            report: {
                id: report._id.toString(),
                range: report.range,
                format: report.format,
                status: report.status,
                completedAt: report.completedAt ??
                    null,
                createdAt: report.createdAt,
                expiresAt: report.expiresAt,
            },
        });
    }
    catch (error) {
        console.error("GET ANALYTICS REPORT ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Unable to load analytics report.",
        });
    }
};
exports.getAnalyticsReportController = getAnalyticsReportController;
/* =========================================================
   DOWNLOAD REPORT
   GET /api/admin/analytics/reports/:id/download
========================================================= */
const downloadAnalyticsReportController = async (req, res) => {
    const adminId = getAdminId(req, res);
    if (!adminId) {
        return;
    }
    try {
        const reportId = asString(req.params
            .id);
        const csv = await (0, analyticsReportService_js_1.getAnalyticsReportCsv)({
            reportId,
            adminId,
        });
        if (!csv) {
            res.status(404).json({
                success: false,
                message: "Analytics report is unavailable, expired, or not ready.",
            });
            return;
        }
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="analytics-report-${reportId}.csv"`);
        res.status(200).send(csv);
    }
    catch (error) {
        console.error("DOWNLOAD ANALYTICS REPORT ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Unable to download analytics report.",
        });
    }
};
exports.downloadAnalyticsReportController = downloadAnalyticsReportController;
