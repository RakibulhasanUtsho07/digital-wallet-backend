import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";

import connectDB from "./config/db.js";

/* =========================================================
   ROUTES
========================================================= */

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
import paymentRoutes from "./routes/paymentRoutes.js";
import revenueRoutes from "./routes/revenueRoutes.js";
import supportRoutes from "./routes/supportRoutes.js";
import kycIntelligenceRoutes from "./routes/kycIntelligenceRoutes.js";
import supportTicketRoutes from "./routes/supportTicketRoutes.js";

import paypalPaymentRoutes from "./routes/paypalPaymentRoutes.js";
import merchantPaymentRoutes from "./routes/merchantPaymentRoutes.js";
import merchantOrderRoutes from "./routes/merchantOrderRoutes.js";
import merchantRefundRoutes from "./routes/merchantRefundRoutes.js";
import merchantInvoiceRoutes from "./routes/merchantInvoiceRoutes.js";
import publicInvoiceRoutes from "./routes/publicInvoiceRoutes.js";

import merchantWebhookRoutes from "./routes/merchantWebhookRoutes.js";
import merchantDashboardWebhookRoutes from "./routes/merchantDashboardWebhookRoutes.js";

import adminMerchantVerificationRoutes from "./routes/adminMerchantVerificationRoutes.js";

/* =========================================================
   E-KYC
========================================================= */

import {
  createEKYCRouter,
} from "./modules/ekyc/routes/ekycRoutes.js";

import {
  createAdminEKYCRouter,
} from "./modules/ekyc/routes/adminEkycRoutes.js";
import merchantSettingsRoutes
  from "./routes/merchantSettingsRoutes.js";
/* =========================================================
   ANALYST
========================================================= */

import analystRoutes from "./modules/analyst/routes/analystRoutes.js";

/* =========================================================
   AUTHORIZATION
========================================================= */

import {
  protect,
} from "./middlewares/authMiddleware.js";

import {
  requireAdmin,
} from "./middlewares/adminAuthorization.js";

/* =========================================================
   TELEMETRY
========================================================= */

import {
  systemTelemetryMiddleware,
} from "./middlewares/systemTelemetryMiddleware.js";

import {
  systemErrorTelemetry,
} from "./middlewares/systemErrorTelemetry.js";

/* =========================================================
   ERROR HANDLERS
========================================================= */

import {
  errorHandler,
  notFound,
} from "./middlewares/errorMiddleware.js";

/* =========================================================
   APP
========================================================= */

const app =
  express();

/* =========================================================
   PROXY

   Required when deployed behind Vercel / reverse proxy
   so Express can resolve the client/proxy chain correctly.
========================================================= */

app.set(
  "trust proxy",
  1,
);

/* =========================================================
   CORS
========================================================= */

const allowedOrigins =
  [
    "http://localhost:3000",
    "http://127.0.0.1:3000",

    process.env.CLIENT_URL
      ?.trim(),

    process.env.ADMIN_CLIENT_URL
      ?.trim(),
  ].filter(
    (
      origin,
    ): origin is string =>
      Boolean(
        origin,
      ),
  );

const corsOptions:
  cors.CorsOptions = {
  origin: (
    origin,
    callback,
  ) => {
    /*
     * Server-to-server requests, Postman and some trusted
     * internal clients may not send an Origin header.
     */
    if (!origin) {
      callback(
        null,
        true,
      );

      return;
    }

    if (
      allowedOrigins.includes(
        origin,
      )
    ) {
      callback(
        null,
        true,
      );

      return;
    }

    console.warn(
      `CORS blocked origin: ${origin}`,
    );

    callback(
      new Error(
        "Origin is not allowed by CORS.",
      ),
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
    "X-Correlation-Id",
    "X-Checkout-Token",
  ],

  exposedHeaders: [
    "X-Request-Id",
    "X-Trace-Id",
  ],

  optionsSuccessStatus:
    204,
};

app.use(
  cors(
    corsOptions,
  ),
);

/*
 * Express 5 catch-all preflight handler.
 */
app.options(
  "/{*any}",
  cors(
    corsOptions,
  ),
);

/* =========================================================
   BODY PARSERS
========================================================= */

app.use(
  express.json({
    limit:
      "2mb",
  }),
);

app.use(
  express.urlencoded({
    extended:
      true,

    limit:
      "2mb",
  }),
);

app.use(
  cookieParser(),
);

/* =========================================================
   REQUEST LOGGER
========================================================= */

app.use(
  (
    req,
    _res,
    next,
  ) => {
    console.log(
      `${req.method} ${req.originalUrl}`,
    );

    next();
  },
);

/* =========================================================
   DATABASE CONNECTION
========================================================= */

app.use(
  async (
    _req,
    res,
    next,
  ) => {
    try {
      await connectDB();

      next();
    } catch (
      error: unknown
    ) {
      console.error(
        "DB CONNECTION ERROR:",
        error,
      );

      res.status(
        503,
      ).json({
        success:
          false,

        message:
          "Database connection failed. Please try again shortly.",
      });
    }
  },
);

/* =========================================================
   SYSTEM TELEMETRY
========================================================= */

app.use(
  systemTelemetryMiddleware,
);

/* =========================================================
   RATE LIMITERS
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

    skip: (
      request,
    ) =>
      request.originalUrl.startsWith(
        "/api/ekyc/",
      ) ||
      request.originalUrl.startsWith(
        "/api/admin/ekyc/",
      ),
  });

const advancedEKYCLimiter =
  rateLimit({
    windowMs:
      15 *
      60 *
      1000,

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
      15 *
      60 *
      1000,

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
  apiLimiter,
);

/* =========================================================
   ROOT / HEALTH
========================================================= */

app.get(
  "/",
  (
    _req,
    res,
  ) => {
    res.status(
      200,
    ).json({
      status:
        "Success",

      message:
        "Digital Wallet API is running",
    });
  },
);

app.get(
  "/api",
  (
    _req,
    res,
  ) => {
    res.status(
      200,
    ).json({
      success:
        true,

      message:
        "Digital Wallet API is running",
    });
  },
);

app.get(
  "/api/health",
  (
    _req,
    res,
  ) => {
    res.status(
      200,
    ).json({
      success:
        true,

      message:
        "Digital Wallet API is healthy",

      timestamp:
        new Date()
          .toISOString(),
    });
  },
);

/* =========================================================
   ANALYST
========================================================= */

app.use(
  "/api/analyst",
  analystRoutes,
);

/* =========================================================
   AUTH
========================================================= */

app.use(
  "/api/auth",
  authRoutes,
);

app.use(
  "/api/auth",
  currentUserRoutes,
);

/* =========================================================
   USERS
========================================================= */

app.use(
  "/api/users",
  userRoutes,
);

/* =========================================================
   MERCHANT DASHBOARD API

   Authentication:
   normal logged-in merchant session

   Examples:

   /api/merchants/overview
   /api/merchants/payments
   /api/merchants/analytics
   /api/merchants/webhooks
   /api/merchants/webhook-events
========================================================= */

/*
 * Dashboard webhook routes are intentionally mounted
 * separately because they use normal session authentication.
 */
app.use(
  "/api/merchants",
  merchantDashboardWebhookRoutes,
);
/* =========================================================
   MERCHANT SETTINGS
========================================================= */

app.use(
  "/api/merchants",
  merchantSettingsRoutes,
);
/*
 * Main Merchant Dashboard routes.
 */
app.use(
  "/api/merchants",
  merchantRoutes,
);

/* =========================================================
   PUBLIC / SERVER-TO-SERVER MERCHANT PAYMENT API

   Authentication:
   sk_test_...
   sk_live_...
========================================================= */

/*
 * PayPal-specific routes must remain before generic
 * merchant payment routes.
 */
app.use(
  "/api/v1/payments",
  paypalPaymentRoutes,
);

app.use(
  "/api/v1/payments",
  merchantPaymentRoutes,
);

/* =========================================================
   PUBLIC / SERVER-TO-SERVER ORDER API
========================================================= */

app.use(
  "/api/v1/orders",
  merchantOrderRoutes,
);

/* =========================================================
   PUBLIC / SERVER-TO-SERVER REFUND API
========================================================= */

app.use(
  "/api/v1/refunds",
  merchantRefundRoutes,
);

/* =========================================================
   PUBLIC / SERVER-TO-SERVER INVOICE API
========================================================= */

app.use(
  "/api/v1/invoices",
  merchantInvoiceRoutes,
);

/* =========================================================
   PUBLIC INVOICE API

   Customer-facing invoice routes.
========================================================= */

app.use(
  "/api/public/invoices",
  publicInvoiceRoutes,
);

/* =========================================================
   MERCHANT WEBHOOK MANAGEMENT API

   IMPORTANT:

   This is NOT the Merchant Dashboard route.

   Authentication:
   sk_test_...
   sk_live_...

   Requires:
   webhooks:manage scope

   Final routes include:

   POST /api/v1/webhooks/endpoints
   GET  /api/v1/webhooks/events
   POST /api/v1/webhooks/events/:eventId/retry
   GET  /api/v1/webhooks
   POST /api/v1/webhooks/:id/rotate-secret
   DELETE /api/v1/webhooks/:id
========================================================= */

app.use(
  "/api/v1/webhooks",
  merchantWebhookRoutes,
);

/* =========================================================
   WALLET
========================================================= */

app.use(
  "/api/wallet",
  walletRoutes,
);

/* =========================================================
   FUNDS
========================================================= */

app.use(
  "/api/funds",
  fundsRoutes,
);

/* =========================================================
   PAYMENT UTILITIES
========================================================= */

app.use(
  "/api/payment",
  paymentRoutes,
);

/* =========================================================
   TRANSFERS
========================================================= */

app.use(
  "/api/transfers",
  transferRoutes,
);

/* =========================================================
   TRANSACTIONS
========================================================= */

app.use(
  "/api/transactions",
  transactionRoutes,
);

/* =========================================================
   SECURITY
========================================================= */

app.use(
  "/api/security",
  securityRoutes,
);

/* =========================================================
   PASSKEYS
========================================================= */

app.use(
  "/api/passkeys",
  passkeyRoutes,
);

/* =========================================================
   SETTINGS
========================================================= */

app.use(
  "/api/settings",
  settingsRoutes,
);

/* =========================================================
   ADVANCED E-KYC
========================================================= */

app.use(
  "/api/ekyc",
  advancedEKYCLimiter,
  protect,
  createEKYCRouter(),
);

/* =========================================================
   LEGACY KYC
========================================================= */

app.use(
  "/api/kyc",
  kycRoutes,
);

/* =========================================================
   AI
========================================================= */

app.use(
  "/api/ai",
  aiRoutes,
);

/* =========================================================
   INSIGHTS
========================================================= */

app.use(
  "/api/insights",
  insightsRoutes,
);

/* =========================================================
   USER FEATURES
========================================================= */

app.use(
  "/api/cash-flow",
  cashFlowRoutes,
);

app.use(
  "/api/notifications",
  notificationRoutes,
);

app.use(
  "/api/budgets",
  budgetRoutes,
);

app.use(
  "/api/receipts",
  receiptRoutes,
);

/* =========================================================
   SUPPORT
========================================================= */

app.use(
  "/api/support/tickets",
  supportTicketRoutes,
);

/* =========================================================
   ADMIN E-KYC
========================================================= */

app.use(
  "/api/admin/ekyc",
  adminEKYCLimiter,
  protect,
  requireAdmin,
  createAdminEKYCRouter(),
);

/* =========================================================
   ADMIN MERCHANT VERIFICATION
========================================================= */

app.use(
  "/api/admin/merchant-verifications",
  adminMerchantVerificationRoutes,
);

/* =========================================================
   ADMIN SYSTEM LOGS
========================================================= */

app.use(
  "/api/admin/logs",
  systemLogsRoutes,
);

/* =========================================================
   ADMIN PLATFORM SETTINGS
========================================================= */

app.use(
  "/api/admin/settings",
  platformSettingsRoutes,
);

/* =========================================================
   ADMIN AUDIT LOGS
========================================================= */

app.use(
  "/api/admin/audit-logs",
  auditRoutes,
);

/* =========================================================
   ADMIN REVENUE
========================================================= */

app.use(
  "/api/admin/revenue",
  revenueRoutes,
);

/* =========================================================
   ADMIN SUPPORT
========================================================= */

app.use(
  "/api/admin/support",
  supportRoutes,
);

/* =========================================================
   ADMIN ANALYTICS
========================================================= */

app.use(
  "/api/admin/analytics",
  analyticsRoutes,
);

/* =========================================================
   ADMIN KYC INTELLIGENCE
========================================================= */

app.use(
  "/api/admin/kyc",
  kycIntelligenceRoutes,
);

/* =========================================================
   ADMIN USER MANAGEMENT
========================================================= */

app.use(
  "/api/admin/users",
  userManagementRoutes,
);

/* =========================================================
   ADMIN OVERVIEW
========================================================= */

app.use(
  "/api/admin/overview",
  adminOverviewRoutes,
);

/* =========================================================
   GENERIC ADMIN ROUTES

   Keep this after specific /api/admin/* routes.
========================================================= */

app.use(
  "/api/admin",
  adminRoutes,
);

/* =========================================================
   404
========================================================= */

app.use(
  notFound,
);

/* =========================================================
   ERROR TELEMETRY
========================================================= */

app.use(
  systemErrorTelemetry,
);

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use(
  errorHandler,
);

/* =========================================================
   EXPORT
========================================================= */

export default app;