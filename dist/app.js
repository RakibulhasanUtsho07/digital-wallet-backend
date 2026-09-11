"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
// =========================================================
// DATABASE
// =========================================================
const db_js_1 = __importDefault(require("./config/db.js"));
// =========================================================
// ROUTES
// =========================================================
const analyticsRoutes_js_1 = __importDefault(require("./routes/analyticsRoutes.js"));
const authRoutes_js_1 = __importDefault(require("./routes/authRoutes.js"));
const currentUserRoutes_js_1 = __importDefault(require("./routes/currentUserRoutes.js"));
const transactionRoutes_js_1 = __importDefault(require("./routes/transactionRoutes.js"));
const userRoutes_js_1 = __importDefault(require("./routes/userRoutes.js"));
const fundsRoutes_js_1 = __importDefault(require("./routes/fundsRoutes.js"));
const kycRoutes_js_1 = __importDefault(require("./routes/kycRoutes.js"));
const adminRoutes_js_1 = __importDefault(require("./routes/adminRoutes.js"));
const aiRoutes_js_1 = __importDefault(require("./routes/aiRoutes.js"));
const notificationRoutes_js_1 = __importDefault(require("./routes/notificationRoutes.js"));
const transferRoutes_js_1 = __importDefault(require("./routes/transferRoutes.js"));
const walletRoutes_js_1 = __importDefault(require("./routes/walletRoutes.js"));
const budgetRoutes_js_1 = __importDefault(require("./routes/budgetRoutes.js"));
const auditRoutes_js_1 = __importDefault(require("./routes/auditRoutes.js"));
const receiptRoutes_js_1 = __importDefault(require("./routes/receiptRoutes.js"));
const insightsRoutes_js_1 = __importDefault(require("./routes/insightsRoutes.js"));
const cashFlowRoutes_js_1 = __importDefault(require("./routes/cashFlowRoutes.js"));
const settingsRoutes_js_1 = __importDefault(require("./routes/settingsRoutes.js"));
const platformSettingsRoutes_js_1 = __importDefault(require("./routes/platformSettingsRoutes.js"));
const systemLogsRoutes_js_1 = __importDefault(require("./routes/systemLogsRoutes.js"));
const userManagementRoutes_js_1 = __importDefault(require("./routes/userManagementRoutes.js"));
const adminOverviewRoutes_js_1 = __importDefault(require("./routes/adminOverviewRoutes.js"));
const securityRoutes_js_1 = __importDefault(require("./routes/securityRoutes.js"));
/*
 * PAYMENT / ADD MONEY
 *
 * Provides:
 * POST /api/payment/validate-source
 * POST /api/payment/add-money
 */
const paymentRoutes_js_1 = __importDefault(require("./routes/paymentRoutes.js"));
/*
 * Revenue Intelligence
 */
const revenueRoutes_js_1 = __importDefault(require("./routes/revenueRoutes.js"));
/*
 * Advanced E-KYC
 */
const adminEkycRoutes_js_1 = require("./modules/ekyc/routes/adminEkycRoutes.js");
/*
 * Admin Support Operations
 */
const supportRoutes_js_1 = __importDefault(require("./routes/supportRoutes.js"));
/*
 * Admin KYC Intelligence
 */
const kycIntelligenceRoutes_js_1 = __importDefault(require("./routes/kycIntelligenceRoutes.js"));
const supportTicketRoutes_js_1 = __importDefault(require("./routes/supportTicketRoutes.js"));
// =========================================================
// TELEMETRY MIDDLEWARE
// =========================================================
const systemTelemetryMiddleware_js_1 = require("./middlewares/systemTelemetryMiddleware.js");
const systemErrorTelemetry_js_1 = require("./middlewares/systemErrorTelemetry.js");
// =========================================================
// ERROR MIDDLEWARE
// =========================================================
const errorMiddleware_js_1 = require("./middlewares/errorMiddleware.js");
/* =========================================================
   APP
========================================================= */
const app = (0, express_1.default)();
/* =========================================================
   TRUST PROXY
========================================================= */
app.set("trust proxy", 1);
/* =========================================================
   CORS
========================================================= */
const allowedOrigins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://digital-payment-system-web.vercel.app",
];
/* =========================================================
   CORS OPTIONS
========================================================= */
const corsOptions = {
    origin: (origin, callback) => {
        /*
         * Allow requests without an Origin header.
         *
         * Examples:
         * - Postman
         * - server-to-server
         * - same-origin tooling
         */
        if (!origin) {
            callback(null, true);
            return;
        }
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }
        console.warn(`CORS blocked origin: ${origin}`);
        callback(new Error("Origin is not allowed by CORS."));
    },
    credentials: true,
    methods: [
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
    ],
    allowedHeaders: [
        "Content-Type",
        "Authorization",
        "Idempotency-Key",
        "X-Request-Id",
        "X-Trace-Id",
    ],
    exposedHeaders: [
        "X-Request-Id",
        "X-Trace-Id",
    ],
    optionsSuccessStatus: 204,
};
/* =========================================================
   ENABLE CORS
========================================================= */
app.use((0, cors_1.default)(corsOptions));
app.options(/{*any}/, (0, cors_1.default)(corsOptions));
/* =========================================================
   BODY PARSERS
========================================================= */
app.use(express_1.default.json({
    limit: "2mb",
}));
app.use(express_1.default.urlencoded({
    extended: true,
    limit: "2mb",
}));
/* =========================================================
   COOKIE PARSER
========================================================= */
app.use((0, cookie_parser_1.default)());
/* =========================================================
   REQUEST LOGGER
========================================================= */
app.use((req, _res, next) => {
    console.log(`${req.method} ${req.originalUrl}`);
    next();
});
/* =========================================================
   DATABASE CONNECTION
========================================================= */
app.use(async (_req, res, next) => {
    try {
        await (0, db_js_1.default)();
        next();
    }
    catch (error) {
        console.error("DB CONNECTION ERROR:", error);
        res.status(503).json({
            success: false,
            message: "Database connection failed. Please try again shortly.",
        });
    }
});
/* =========================================================
   SYSTEM TELEMETRY
========================================================= */
app.use(systemTelemetryMiddleware_js_1.systemTelemetryMiddleware);
/* =========================================================
   GLOBAL API RATE LIMIT
========================================================= */
const apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 *
        60 *
        1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many requests. Please try again after 15 minutes.",
    },
});
app.use("/api/", apiLimiter);
/* =========================================================
   ROOT
========================================================= */
app.get("/", (_req, res) => {
    res.status(200).json({
        status: "Success",
        message: "Digital Wallet API is running",
    });
});
/* =========================================================
   API ROOT
========================================================= */
app.get("/api", (_req, res) => {
    res.status(200).json({
        success: true,
        message: "Digital Wallet API is running",
    });
});
/* =========================================================
   HEALTH CHECK
========================================================= */
app.get("/api/health", (_req, res) => {
    res.status(200).json({
        success: true,
        message: "Digital Wallet API is healthy",
        timestamp: new Date().toISOString(),
    });
});
/* =========================================================
   AUTH
========================================================= */
app.use("/api/auth", authRoutes_js_1.default);
/* =========================================================
   CURRENT USER
========================================================= */
app.use("/api/auth", currentUserRoutes_js_1.default);
/* =========================================================
   USERS
========================================================= */
app.use("/api/users", userRoutes_js_1.default);
/* =========================================================
   SECURITY
========================================================= */
app.use("/api/security", securityRoutes_js_1.default);
/* =========================================================
   SETTINGS
========================================================= */
app.use("/api/settings", settingsRoutes_js_1.default);
/* =========================================================
   WALLET
========================================================= */
app.use("/api/wallet", walletRoutes_js_1.default);
/* =========================================================
   FUNDS
========================================================= */
app.use("/api/funds", fundsRoutes_js_1.default);
/* =========================================================
   PAYMENT / ADD MONEY
========================================================= */
/*
 * IMPORTANT
 *
 * Frontend calls:
 *
 * POST /api/payment/validate-source
 * POST /api/payment/add-money
 *
 * Therefore the router MUST be mounted here.
 */
app.use("/api/payment", paymentRoutes_js_1.default);
/* =========================================================
   TRANSFERS
========================================================= */
app.use("/api/transfers", transferRoutes_js_1.default);
/* =========================================================
   TRANSACTIONS
========================================================= */
app.use("/api/transactions", transactionRoutes_js_1.default);
/* =========================================================
   KYC
========================================================= */
app.use("/api/kyc", kycRoutes_js_1.default);
/* =========================================================
   AI
========================================================= */
app.use("/api/ai", aiRoutes_js_1.default);
/* =========================================================
   INSIGHTS
========================================================= */
app.use("/api/insights", insightsRoutes_js_1.default);
/* =========================================================
   CASH FLOW
========================================================= */
app.use("/api/cash-flow", cashFlowRoutes_js_1.default);
/* =========================================================
   NOTIFICATIONS
========================================================= */
app.use("/api/notifications", notificationRoutes_js_1.default);
/* =========================================================
   BUDGETS
========================================================= */
app.use("/api/budgets", budgetRoutes_js_1.default);
/* =========================================================
   RECEIPTS
========================================================= */
app.use("/api/receipts", receiptRoutes_js_1.default);
/* =========================================================
   ADMIN SYSTEM LOGS
========================================================= */
app.use("/api/admin/logs", systemLogsRoutes_js_1.default);
/* =========================================================
   ADMIN PLATFORM SETTINGS
========================================================= */
app.use("/api/admin/settings", platformSettingsRoutes_js_1.default);
/* =========================================================
   ADMIN AUDIT LOGS
========================================================= */
app.use("/api/admin/audit-logs", auditRoutes_js_1.default);
/* =========================================================
   ADMIN E-KYC
========================================================= */
app.use("/api/admin/ekyc", (0, adminEkycRoutes_js_1.createAdminEKYCRouter)());
/* =========================================================
   ADMIN REVENUE INTELLIGENCE
========================================================= */
app.use("/api/admin/revenue", revenueRoutes_js_1.default);
/* =========================================================
   SUPPORT TICKETS
========================================================= */
app.use("/api/support/tickets", supportTicketRoutes_js_1.default);
/* =========================================================
   ADMIN SUPPORT OPERATIONS
========================================================= */
app.use("/api/admin/support", supportRoutes_js_1.default);
/* =========================================================
   ADMIN ANALYTICS
========================================================= */
app.use("/api/admin/analytics", analyticsRoutes_js_1.default);
/* =========================================================
   ADMIN KYC INTELLIGENCE
========================================================= */
app.use("/api/admin/kyc", kycIntelligenceRoutes_js_1.default);
/* =========================================================
   ADMIN USER MANAGEMENT
========================================================= */
app.use("/api/admin/users", userManagementRoutes_js_1.default);
/* =========================================================
   ADMIN DASHBOARD OVERVIEW
========================================================= */
app.use("/api/admin/overview", adminOverviewRoutes_js_1.default);
/* =========================================================
   GENERIC ADMIN ROUTER
========================================================= */
app.use("/api/admin", adminRoutes_js_1.default);
/* =========================================================
   404 HANDLER
========================================================= */
app.use(errorMiddleware_js_1.notFound);
/* =========================================================
   SYSTEM ERROR TELEMETRY
========================================================= */
app.use(systemErrorTelemetry_js_1.systemErrorTelemetry);
/* =========================================================
   FINAL ERROR HANDLER
========================================================= */
app.use(errorMiddleware_js_1.errorHandler);
/* =========================================================
   EXPORT
========================================================= */
exports.default = app;
