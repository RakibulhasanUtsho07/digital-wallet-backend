"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.investigateLeakage = exports.getContributors = exports.getLeakage = exports.simulateRevenue = exports.getRevenueFeePolicy = void 0;
const revenueAnalyticsService_js_1 = require("../services/revenueAnalyticsService.js");
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
const getRevenueFeePolicy = async (_req, res) => {
    try {
        const policy = await (0, revenueAnalyticsService_js_1.getOrCreateRevenueFeePolicy)();
        res.status(200).json({
            success: true,
            policy: (0, revenueAnalyticsService_js_1.feePolicyToDTO)(policy),
        });
    }
    catch (error) {
        console.error("GET REVENUE FEE POLICY ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Unable to load the revenue fee policy.",
        });
    }
};
exports.getRevenueFeePolicy = getRevenueFeePolicy;
const simulateRevenue = async (req, res) => {
    try {
        const simulation = await (0, revenueAnalyticsService_js_1.simulateRevenueFees)({
            transferFeeMinor: req.body
                ?.transferFeeMinor,
            withdrawalFeeMinor: req.body
                ?.withdrawalFeeMinor,
            monthlyTransactions: req.body
                ?.monthlyTransactions,
        });
        res.status(200).json({
            success: true,
            simulation,
        });
    }
    catch (error) {
        const message = error instanceof
            Error
            ? error.message
            : "Invalid revenue simulation request.";
        res.status(400).json({
            success: false,
            message,
        });
    }
};
exports.simulateRevenue = simulateRevenue;
const getLeakage = async (req, res) => {
    try {
        const range = (0, revenueAnalyticsService_js_1.normalizeRevenueRange)(req.query
            .range);
        const result = await (0, revenueAnalyticsService_js_1.getRevenueLeakage)(range);
        res.status(200).json({
            success: true,
            range,
            ...result,
        });
    }
    catch (error) {
        console.error("GET REVENUE LEAKAGE ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Unable to load revenue leakage signals.",
        });
    }
};
exports.getLeakage = getLeakage;
const getContributors = async (req, res) => {
    try {
        const range = (0, revenueAnalyticsService_js_1.normalizeRevenueRange)(req.query
            .range);
        const requestedLimit = Number(req.query
            .limit);
        const limit = Number.isFinite(requestedLimit)
            ? Math.max(1, Math.min(25, Math.floor(requestedLimit)))
            : 4;
        const contributors = await (0, revenueAnalyticsService_js_1.getRevenueContributors)({
            range,
            limit,
        });
        res.status(200).json({
            success: true,
            range,
            contributors,
        });
    }
    catch (error) {
        console.error("GET REVENUE CONTRIBUTORS ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Unable to load top revenue contributors.",
        });
    }
};
exports.getContributors = getContributors;
const investigateLeakage = async (req, res) => {
    try {
        const adminId = req.user
            ?._id;
        if (!adminId) {
            res.status(401).json({
                success: false,
                message: "Authentication is required.",
            });
            return;
        }
        const category = asString(req.body
            ?.category)
            .trim()
            .slice(0, 120);
        const range = (0, revenueAnalyticsService_js_1.normalizeRevenueRange)(req.body
            ?.range);
        const note = asString(req.body
            ?.note);
        if (!category) {
            res.status(400).json({
                success: false,
                message: "Leakage category is required.",
            });
            return;
        }
        const investigation = await (0, revenueAnalyticsService_js_1.openLeakageInvestigation)({
            category,
            range,
            note,
            adminId,
        });
        res.status(201).json({
            success: true,
            message: "Revenue leakage investigation is active.",
            investigation: {
                id: investigation._id.toString(),
                category: investigation.category,
                status: investigation.status,
            },
        });
    }
    catch (error) {
        console.error("OPEN REVENUE INVESTIGATION ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Unable to open the leakage investigation.",
        });
    }
};
exports.investigateLeakage = investigateLeakage;
