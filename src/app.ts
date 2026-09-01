import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";

// =========================================================
// DATABASE
// =========================================================

import connectDB from "./config/db.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
// =========================================================
// ROUTES
// =========================================================

import authRoutes from "./routes/authRoutes.js";
import transactionRoutes from "./routes/transactionRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import fundsRoutes from "./routes/fundsRoutes.js";
import kycRoutes from "./routes/kycRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import transferRoutes from "./routes/transferRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";
import budgetRoutes from "./routes/budgetRoutes.js";
import auditRoutes from "./routes/auditRoutes.js";
import receiptRoutes from "./routes/receiptRoutes.js";
import insightsRoutes from "./routes/insightsRoutes.js";
import cashFlowRoutes from "./routes/cashFlowRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import platformSettingsRoutes from "./routes/platformSettingsRoutes.js";
import systemLogsRoutes from "./routes/systemLogsRoutes.js";

/*
 * Revenue Intelligence
 */
import revenueRoutes from "./routes/revenueRoutes.js";

/*
 * Admin Support Operations
 */
import supportRoutes from "./routes/supportRoutes.js";

// =========================================================
// TELEMETRY MIDDLEWARE
// =========================================================

import {
  systemTelemetryMiddleware,
} from "./middlewares/systemTelemetryMiddleware.js";

import {
  systemErrorTelemetry,
} from "./middlewares/systemErrorTelemetry.js";

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
  "https://digital-payment-system-web.vercel.app",
];

/* =========================================================
   CORS OPTIONS
========================================================= */

const corsOptions:
  cors.CorsOptions = {
  origin: (
    origin,
    callback
  ) => {
    /*
     * Allow requests without an Origin header.
     *
     * Examples:
     * Postman
     * server-to-server
     * same-origin tooling
     */
    if (
      !origin
    ) {
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

  credentials:
    true,

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

  /*
   * Allow frontend to read telemetry IDs.
   */
  exposedHeaders: [
    "X-Request-Id",
    "X-Trace-Id",
  ],

  optionsSuccessStatus:
    204,
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
    extended:
      true,

    limit:
      "2mb",
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

      res
        .status(
          503
        )
        .json({
          success:
            false,

          message:
            "Database connection failed. Please try again shortly.",
        });
    }
  }
);

/* =========================================================
   SYSTEM TELEMETRY

   Keep AFTER DB connection and BEFORE rate limiter/routes.
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
  });

app.use(
  "/api/",
  apiLimiter
);

/* =========================================================
   ROOT ROUTE
========================================================= */

app.get(
  "/",
  (
    _req,
    res
  ) => {
    res
      .status(
        200
      )
      .json({
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
    res
      .status(
        200
      )
      .json({
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
    res
      .status(
        200
      )
      .json({
        success:
          true,

        message:
          "Digital Wallet API is healthy",

        timestamp:
          new Date()
            .toISOString(),
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
   USERS
========================================================= */

app.use(
  "/api/users",
  userRoutes
);

/* =========================================================
   USER SETTINGS
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
   TRANSFERS
========================================================= */

app.use(
  "/api/transfers",
  transferRoutes
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
   ADMIN ROUTES

   IMPORTANT:

   Specific admin routes MUST stay before:

   /api/admin

   because /api/admin is the generic admin router.
========================================================= */

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
   ADMIN REVENUE INTELLIGENCE
========================================================= */

app.use(
  "/api/admin/revenue",
  revenueRoutes
);

/* =========================================================
   ADMIN SUPPORT OPERATIONS
========================================================= */

app.use(
  "/api/admin/support",
  supportRoutes
);
app.use(
  "/api/admin/analytics",
  analyticsRoutes
);
/* =========================================================
   GENERIC ADMIN ROUTER

   KEEP THIS LAST among /api/admin routes.
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

   Keep before final errorHandler.
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