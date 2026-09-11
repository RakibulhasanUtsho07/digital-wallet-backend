import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";

// =========================================================
// DATABASE
// =========================================================

import connectDB from "./config/db.js";

// =========================================================
// ROUTES
// =========================================================

import analyticsRoutes from "./routes/analyticsRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import currentUserRoutes from "./routes/currentUserRoutes.js";
import transactionRoutes from "./routes/transactionRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import fundsRoutes from "./routes/fundsRoutes.js";
import kycRoutes from "./routes/kycRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import transferRoutes from "./routes/transferRoutes.js";
import passkeyRoutes from "./routes/passkeyRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";
import budgetRoutes from "./routes/budgetRoutes.js";
import auditRoutes from "./routes/auditRoutes.js";
import receiptRoutes from "./routes/receiptRoutes.js";
import insightsRoutes from "./routes/insightsRoutes.js";
import cashFlowRoutes from "./routes/cashFlowRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import platformSettingsRoutes from "./routes/platformSettingsRoutes.js";
import systemLogsRoutes from "./routes/systemLogsRoutes.js";
import userManagementRoutes from "./routes/userManagementRoutes.js";
import adminOverviewRoutes from "./routes/adminOverviewRoutes.js";
import securityRoutes from "./routes/securityRoutes.js";
import merchantRoutes from "./routes/merchantRoutes.js";
import {
  protect,
} from "./middlewares/authMiddleware.js";

import {
  requireAdmin,
} from "./middlewares/adminAuthorization.js";




import merchantPaymentRoutes from "./routes/merchantPaymentRoutes.js";
/*
 * PAYMENT / ADD MONEY
 *
 * Provides:
 * POST /api/payment/validate-source
 * POST /api/payment/add-money
 */
import paymentRoutes from "./routes/paymentRoutes.js";

/*
 * Revenue Intelligence
 */
import revenueRoutes from "./routes/revenueRoutes.js";
import merchantWebhookRoutes from "./routes/merchantWebhookRoutes.js";
/*
 * Advanced E-KYC
 */
import {
  createEKYCRouter,
} from "./modules/ekyc/routes/ekycRoutes.js";

import { createAdminEKYCRouter } from "./modules/ekyc/routes/adminEkycRoutes.js";

/*
 * Admin Support Operations
 */
import supportRoutes from "./routes/supportRoutes.js";

/*
 * Admin KYC Intelligence
 */
import kycIntelligenceRoutes from "./routes/kycIntelligenceRoutes.js";

import supportTicketRoutes from "./routes/supportTicketRoutes.js";
import paypalPaymentRoutes from "./routes/paypalPaymentRoutes.js";
// =========================================================
// TELEMETRY MIDDLEWARE
// =========================================================

import {
  systemTelemetryMiddleware,
} from "./middlewares/systemTelemetryMiddleware.js";

import {
  systemErrorTelemetry,
} from "./middlewares/systemErrorTelemetry.js";
import merchantOrderRoutes from "./routes/merchantOrderRoutes.js";
// =========================================================
// ERROR MIDDLEWARE
// =========================================================

import {
  notFound,
  errorHandler,
} from "./middlewares/errorMiddleware.js";

/* =========================================================
   APP
========================================================= */

const app = express();

/* =========================================================
   TRUST PROXY
========================================================= */

app.set(
  "trust proxy",
  1
);

/* =========================================================
   CORS
========================================================= */

const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  process.env.CLIENT_URL?.trim(),
  process.env.ADMIN_CLIENT_URL?.trim(),
].filter((origin): origin is string => Boolean(origin));

/* =========================================================
   CORS OPTIONS
========================================================= */

const corsOptions: cors.CorsOptions = {
  origin: (
    origin,
    callback
  ) => {
    /*
     * Allow requests without an Origin header.
     *
     * Examples:
     * - Postman
     * - server-to-server
     * - same-origin tooling
     */
    if (!origin) {
      callback(
        null,
        true
      );

      return;
    }

    if (
      allowedOrigins.includes(
        origin
      )
    ) {
      callback(
        null,
        true
      );

      return;
    }

    console.warn(
      `CORS blocked origin: ${origin}`
    );

    callback(
      new Error(
        "Origin is not allowed by CORS."
      )
    );
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
    "X-Correlation-Id",
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

app.use(
  cors(
    corsOptions
  )
);

app.options(
  /{*any}/,
  cors(
    corsOptions
  )
);

/* =========================================================
   BODY PARSERS
========================================================= */

app.use(
  express.json({
    limit:
      "2mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "2mb",
  })
);

/* =========================================================
   COOKIE PARSER
========================================================= */

app.use(
  cookieParser()
);

/* =========================================================
   REQUEST LOGGER
========================================================= */

app.use(
  (
    req,
    _res,
    next
  ) => {
    console.log(
      `${req.method} ${req.originalUrl}`
    );

    next();
  }
);

/* =========================================================
   DATABASE CONNECTION
========================================================= */

app.use(
  async (
    _req,
    res,
    next
  ) => {
    try {
      await connectDB();

      next();
    } catch (
      error
    ) {
      console.error(
        "DB CONNECTION ERROR:",
        error
      );

      res.status(
        503
      ).json({
        success: false,

        message:
          "Database connection failed. Please try again shortly.",
      });
    }
  }
);

/* =========================================================
   SYSTEM TELEMETRY
========================================================= */

app.use(
  systemTelemetryMiddleware
);

/* =========================================================
   GLOBAL API RATE LIMIT
========================================================= */

const apiLimiter =
  rateLimit({
    windowMs:
      15 *
      60 *
      1000,

    max:
      100,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {
      success:
        false,

      message:
        "Too many requests. Please try again after 15 minutes.",
    },

    /* Advanced e-KYC uses its own route-specific limits. */
    skip: (request) =>
      request.originalUrl.startsWith("/api/ekyc/") ||
      request.originalUrl.startsWith("/api/admin/ekyc/"),
  });

const advancedEKYCLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    max:
      300,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {
      success:
        false,

      message:
        "Too many e-KYC requests. Please try again shortly.",
    },
  });

const adminEKYCLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    max:
      240,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {
      success:
        false,

      message:
        "Too many administrator e-KYC requests. Please try again shortly.",
    },
  });

app.use(
  "/api/",
  apiLimiter
);

/* =========================================================
   ROOT
========================================================= */

app.get(
  "/",
  (
    _req,
    res
  ) => {
    res.status(
      200
    ).json({
      status:
        "Success",

      message:
        "Digital Wallet API is running",
    });
  }
);

/* =========================================================
   API ROOT
========================================================= */

app.get(
  "/api",
  (
    _req,
    res
  ) => {
    res.status(
      200
    ).json({
      success:
        true,

      message:
        "Digital Wallet API is running",
    });
  }
);

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get(
  "/api/health",
  (
    _req,
    res
  ) => {
    res.status(
      200
    ).json({
      success:
        true,

      message:
        "Digital Wallet API is healthy",

      timestamp:
        new Date().toISOString(),
    });
  }
);

/* =========================================================
   AUTH
========================================================= */

app.use(
  "/api/auth",
  authRoutes
);

/* =========================================================
   CURRENT USER
========================================================= */

app.use(
  "/api/auth",
  currentUserRoutes
);

/* =========================================================
   USERS
========================================================= */

app.use(
  "/api/users",
  userRoutes
);
/* =========================================================
   MERCHANT
========================================================= */

app.use(
  "/api/merchants",
  merchantRoutes
);

/* =========================================================
   SECURITY
========================================================= */

app.use(
  "/api/security",
  securityRoutes
);

/* =========================================================
   SETTINGS
========================================================= */

app.use(
  "/api/settings",
  settingsRoutes
);

/* =========================================================
   WALLET
========================================================= */

app.use(
  "/api/wallet",
  walletRoutes
);

/* =========================================================
   FUNDS
========================================================= */

app.use(
  "/api/funds",
  fundsRoutes
);

/* =========================================================
   PAYMENT / ADD MONEY
========================================================= */
/* =========================================================
   PAYPAL PAYMENT ROUTES
 *
 * Keep PayPal routes first so:
 * /paypal
 * /return
 * /cancel
 * are handled by PayPal before merchant payment routes.
========================================================= */

app.use(
  "/api/v1/payments",
  paypalPaymentRoutes,
);

/* =========================================================
   WALLET PAYMENT GATEWAY
 *
 * Merchant:
 * POST /api/v1/payments
 *
 * Merchant:
 * GET /api/v1/payments/:paymentId
 *
 * Customer:
 * GET /api/v1/payments/:paymentId/checkout
 *
 * Customer:
 * POST /api/v1/payments/:paymentId/confirm
========================================================= */

app.use(
  "/api/v1/payments",
  merchantPaymentRoutes,
);
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

app.use(
  "/api/payment",
  paymentRoutes
);
/* =========================================================
   PUBLIC MERCHANT ORDER API
========================================================= */

app.use(
  "/api/v1/orders",
  merchantOrderRoutes
);

/* =========================================================
   MERCHANT WEBHOOKS
========================================================= */

app.use(
  "/api/v1/webhooks",
  merchantWebhookRoutes
);
/* =========================================================
   TRANSFERS
========================================================= */

app.use(
  "/api/transfers",
  transferRoutes
);

/* =========================================================
   PASSKEYS / BIOMETRIC PAYMENT
========================================================= */

app.use(
  "/api/passkeys",
  passkeyRoutes
);

/* =========================================================
   TRANSACTIONS
========================================================= */

app.use(
  "/api/transactions",
  transactionRoutes
);

/* =========================================================
   KYC
========================================================= */

/*
 * Advanced customer e-KYC API:
 *
 * POST /api/ekyc/liveness/challenges
 * POST /api/ekyc/fingerprint/mock-captures
 * GET  /api/ekyc/verifications/current
 * POST /api/ekyc/verifications
 */

app.use(
  "/api/ekyc",
  advancedEKYCLimiter,
  protect,
  createEKYCRouter()
);

/*
 * Legacy KYC routes are retained temporarily for compatibility.
 */

app.use(
  "/api/kyc",
  kycRoutes
);

/* =========================================================
   AI
========================================================= */

app.use(
  "/api/ai",
  aiRoutes
);

/* =========================================================
   INSIGHTS
========================================================= */

app.use(
  "/api/insights",
  insightsRoutes
);

/* =========================================================
   CASH FLOW
========================================================= */

app.use(
  "/api/cash-flow",
  cashFlowRoutes
);

/* =========================================================
   NOTIFICATIONS
========================================================= */

app.use(
  "/api/notifications",
  notificationRoutes
);

/* =========================================================
   BUDGETS
========================================================= */

app.use(
  "/api/budgets",
  budgetRoutes
);

/* =========================================================
   RECEIPTS
========================================================= */

app.use(
  "/api/receipts",
  receiptRoutes
);

/* =========================================================
   ADMIN SYSTEM LOGS
========================================================= */

app.use(
  "/api/admin/logs",
  systemLogsRoutes
);

/* =========================================================
   ADMIN PLATFORM SETTINGS
========================================================= */

app.use(
  "/api/admin/settings",
  platformSettingsRoutes
);

/* =========================================================
   ADMIN AUDIT LOGS
========================================================= */

app.use(
  "/api/admin/audit-logs",
  auditRoutes
);

/* =========================================================
   ADMIN E-KYC
========================================================= */

app.use(
  "/api/admin/ekyc",
  adminEKYCLimiter,
  protect,
  requireAdmin,
  createAdminEKYCRouter()
);

/* =========================================================
   ADMIN REVENUE INTELLIGENCE
========================================================= */

app.use(
  "/api/admin/revenue",
  revenueRoutes
);

/* =========================================================
   SUPPORT TICKETS
========================================================= */

app.use(
  "/api/support/tickets",
  supportTicketRoutes
);

/* =========================================================
   ADMIN SUPPORT OPERATIONS
========================================================= */

app.use(
  "/api/admin/support",
  supportRoutes
);

/* =========================================================
   ADMIN ANALYTICS
========================================================= */

app.use(
  "/api/admin/analytics",
  analyticsRoutes
);

/* =========================================================
   ADMIN KYC INTELLIGENCE
========================================================= */

app.use(
  "/api/admin/kyc",
  kycIntelligenceRoutes
);

/* =========================================================
   ADMIN USER MANAGEMENT
========================================================= */

app.use(
  "/api/admin/users",
  userManagementRoutes
);

/* =========================================================
   ADMIN DASHBOARD OVERVIEW
========================================================= */

app.use(
  "/api/admin/overview",
  adminOverviewRoutes
);

/* =========================================================
   GENERIC ADMIN ROUTER
========================================================= */

app.use(
  "/api/admin",
  adminRoutes
);

/* =========================================================
   404 HANDLER
========================================================= */

app.use(
  notFound
);

/* =========================================================
   SYSTEM ERROR TELEMETRY
========================================================= */

app.use(
  systemErrorTelemetry
);

/* =========================================================
   FINAL ERROR HANDLER
========================================================= */

app.use(
  errorHandler
);

/* =========================================================
   EXPORT
========================================================= */

export default app;
