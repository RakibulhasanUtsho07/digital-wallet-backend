"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnalyticsReportCsv = exports.getAnalyticsReport = exports.createAnalyticsReport = exports.analyticsDashboardToCsv = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const AnalyticsReport_js_1 = require("../models/AnalyticsReport.js");
const analyticsAggregationService_js_1 = require("./analyticsAggregationService.js");
/* =========================================================
   HELPERS
========================================================= */
const REPORT_TTL_DAYS = 7;
const csvCell = (value) => `"${String(value ??
    "").replace(/"/g, '""')}"`;
const numberValue = (value) => Number.isFinite(value)
    ? value
    : 0;
/* =========================================================
   CSV EXPORT
========================================================= */
const analyticsDashboardToCsv = (dashboard) => {
    const rows = [
        [
            "Section",
            "Metric",
            "Value",
            "Range",
            "Generated At",
        ],
        [
            "Overview",
            "Transaction Volume",
            numberValue(dashboard.overview.transactionVolume),
            dashboard.range,
            dashboard.generatedAt,
        ],
        [
            "Overview",
            "Transaction Count",
            dashboard.overview.transactionCount,
            dashboard.range,
            dashboard.generatedAt,
        ],
        [
            "Overview",
            "Active Users",
            dashboard.overview.activeUsers,
            dashboard.range,
            dashboard.generatedAt,
        ],
        [
            "Overview",
            "Wallet Balance",
            numberValue(dashboard.overview.walletBalance),
            dashboard.range,
            dashboard.generatedAt,
        ],
        [
            "Overview",
            "KYC Completion %",
            dashboard.overview.kycCompletion,
            dashboard.range,
            dashboard.generatedAt,
        ],
        [
            "Overview",
            "Platform Revenue",
            numberValue(dashboard.overview.platformRevenue),
            dashboard.range,
            dashboard.generatedAt,
        ],
        [
            "Overview",
            "Failure Rate %",
            dashboard.overview.failedRate,
            dashboard.range,
            dashboard.generatedAt,
        ],
        [
            "Overview",
            "High Risk Exposure",
            numberValue(dashboard.overview.highRiskExposure),
            dashboard.range,
            dashboard.generatedAt,
        ],
        [
            "Overview",
            "Average Transaction Value",
            numberValue(dashboard.overview.avgTransactionValue),
            dashboard.range,
            dashboard.generatedAt,
        ],
        [
            "Overview",
            "Merchant Share %",
            dashboard.overview.merchantShare,
            dashboard.range,
            dashboard.generatedAt,
        ],
        [
            "Overview",
            "Retention Rate %",
            dashboard.overview.retentionRate,
            dashboard.range,
            dashboard.generatedAt,
        ],
        [
            "Overview",
            "Dispute Rate %",
            dashboard.overview.disputeRate,
            dashboard.range,
            dashboard.generatedAt,
        ],
    ];
    for (const item of dashboard.pulse) {
        rows.push([
            "Platform Pulse",
            item.label,
            item.score,
            dashboard.range,
            dashboard.generatedAt,
        ]);
    }
    for (const item of dashboard.channels) {
        rows.push([
            "Channels",
            item.label,
            item.value,
            dashboard.range,
            dashboard.generatedAt,
        ]);
    }
    for (const item of dashboard.failureReasons) {
        rows.push([
            "Failure Reasons",
            item.label,
            item.value,
            dashboard.range,
            dashboard.generatedAt,
        ]);
    }
    for (const item of dashboard.geography) {
        rows.push([
            "Geography",
            item.label,
            item.value,
            dashboard.range,
            dashboard.generatedAt,
        ]);
    }
    for (const item of dashboard.riskMatrix) {
        rows.push([
            "Risk Matrix",
            `${item.label} Count`,
            item.count,
            dashboard.range,
            dashboard.generatedAt,
        ]);
        rows.push([
            "Risk Matrix",
            `${item.label} Exposure`,
            item.amount,
            dashboard.range,
            dashboard.generatedAt,
        ]);
    }
    return rows
        .map((row) => row
        .map(csvCell)
        .join(","))
        .join("\n");
};
exports.analyticsDashboardToCsv = analyticsDashboardToCsv;
/* =========================================================
   REPORT CREATION
========================================================= */
const createAnalyticsReport = async ({ adminId, range, format, }) => {
    const report = await AnalyticsReport_js_1.AnalyticsReport.create({
        requestedByAdminId: adminId,
        range,
        format,
        status: "processing",
        expiresAt: new Date(Date.now() +
            REPORT_TTL_DAYS *
                24 *
                60 *
                60 *
                1000),
    });
    try {
        const dashboard = await (0, analyticsAggregationService_js_1.getAnalyticsDashboard)({
            range,
            forceFresh: false,
        });
        report.snapshot =
            dashboard;
        report.status =
            "ready";
        report.completedAt =
            new Date();
        report.errorMessage =
            undefined;
        await report.save();
        return report;
    }
    catch (error) {
        report.status =
            "failed";
        report.errorMessage =
            error instanceof
                Error
                ? error.message.slice(0, 500)
                : "Analytics report generation failed.";
        report.completedAt =
            new Date();
        await report.save();
        throw error;
    }
};
exports.createAnalyticsReport = createAnalyticsReport;
/* =========================================================
   REPORT READ
========================================================= */
const getAnalyticsReport = async ({ reportId, adminId, }) => {
    if (!mongoose_1.default.Types.ObjectId.isValid(reportId)) {
        return null;
    }
    return AnalyticsReport_js_1.AnalyticsReport.findOne({
        _id: reportId,
        requestedByAdminId: adminId,
        expiresAt: {
            $gt: new Date(),
        },
    }).lean();
};
exports.getAnalyticsReport = getAnalyticsReport;
const getAnalyticsReportCsv = async ({ reportId, adminId, }) => {
    const report = await (0, exports.getAnalyticsReport)({
        reportId,
        adminId,
    });
    if (!report ||
        report.status !==
            "ready" ||
        !report.snapshot) {
        return null;
    }
    return (0, exports.analyticsDashboardToCsv)(report.snapshot);
};
exports.getAnalyticsReportCsv = getAnalyticsReportCsv;
