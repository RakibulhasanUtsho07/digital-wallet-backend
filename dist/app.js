"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
// Database
const db_js_1 = __importDefault(require("./config/db.js"));
// Routes
const authRoutes_js_1 = __importDefault(require("./routes/authRoutes.js"));
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
// Error middleware
const errorMiddleware_js_1 = require("./middlewares/errorMiddleware.js");
const app = (0, express_1.default)();
/* =========================================================
   TRUST PROXY
   Required/helpful for Vercel / reverse proxy environments
========================================================= */
app.set("trust proxy", 1);
/* =========================================================
   CORS
========================================================= */
const allowedOrigins = [
    "http://localhost:3000",
    "https://digital-payment-system-web.vercel.app",
];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests such as curl/server-to-server
        // that do not send an Origin header.
        if (!origin) {
            return callback(null, true);
        }
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`CORS blocked for origin: ${origin}`));
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
    ],
}));
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
   Keep it minimal and do not log sensitive request bodies.
========================================================= */
app.use((req, _res, next) => {
    console.log(`${req.method} ${req.originalUrl}`);
    next();
});
/* =========================================================
   DATABASE CONNECTION
   Connect before any route handler executes.
========================================================= */
app.use(async (_req, res, next) => {
    try {
        await (0, db_js_1.default)();
        next();
    }
    catch (error) {
        console.error("❌ DB CONNECTION MIDDLEWARE ERROR:", error);
        return res.status(503).json({
            success: false,
            message: "Database connection failed. Please try again shortly.",
        });
    }
});
/* =========================================================
   RATE LIMIT
========================================================= */
const apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many requests from this IP, please try again after 15 minutes.",
    },
});
app.use("/api/", apiLimiter);
/* =========================================================
   HEALTH / ROOT
========================================================= */
app.get("/", (_req, res) => {
    res.status(200).json({
        status: "Success",
        message: "Digital Wallet API is running",
    });
});
app.get("/api", (_req, res) => {
    res.status(200).json({
        success: true,
        message: "Digital Wallet API is running",
    });
});
app.get("/api/health", (_req, res) => {
    res.status(200).json({
        success: true,
        message: "Digital Wallet API is healthy",
        timestamp: new Date().toISOString(),
    });
});
/* =========================================================
   API ROUTES
========================================================= */
app.use("/api/auth", authRoutes_js_1.default);
app.use("/api/users", userRoutes_js_1.default);
app.use("/api/wallet", walletRoutes_js_1.default);
app.use("/api/funds", fundsRoutes_js_1.default);
app.use("/api/transfers", transferRoutes_js_1.default);
app.use("/api/transactions", transactionRoutes_js_1.default);
app.use("/api/kyc", kycRoutes_js_1.default);
app.use("/api/admin", adminRoutes_js_1.default);
app.use("/api/admin/audit-logs", auditRoutes_js_1.default);
app.use("/api/ai", aiRoutes_js_1.default);
app.use("/api/notifications", notificationRoutes_js_1.default);
app.use("/api/budgets", budgetRoutes_js_1.default);
app.use("/api/receipts", receiptRoutes_js_1.default);
/* =========================================================
   404 HANDLER
========================================================= */
app.use(errorMiddleware_js_1.notFound);
/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */
app.use(errorMiddleware_js_1.errorHandler);
exports.default = app;
