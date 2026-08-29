import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";

// Database
import connectDB from "./config/db.js";

// Routes
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

// Error middleware
import {
  notFound,
  errorHandler,
} from "./middlewares/errorMiddleware.js";

const app = express();

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

const corsOptions: cors.CorsOptions = {
  origin: (
    origin,
    callback
  ) => {
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
    limit: "2mb",
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
   RATE LIMIT
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
   ROUTES
========================================================= */

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/users",
  userRoutes
);

app.use(
  "/api/wallet",
  walletRoutes
);

app.use(
  "/api/funds",
  fundsRoutes
);

app.use(
  "/api/transfers",
  transferRoutes
);

app.use(
  "/api/transactions",
  transactionRoutes
);

app.use(
  "/api/kyc",
  kycRoutes
);

app.use(
  "/api/admin",
  adminRoutes
);

app.use(
  "/api/admin/audit-logs",
  auditRoutes
);

app.use(
  "/api/ai",
  aiRoutes
);

app.use(
  "/api/insights",
  insightsRoutes
);

app.use(
  "/api/cash-flow",
  cashFlowRoutes
);

app.use(
  "/api/notifications",
  notificationRoutes
);

app.use(
  "/api/budgets",
  budgetRoutes
);

app.use(
  "/api/receipts",
  receiptRoutes
);

/* =========================================================
   404
========================================================= */

app.use(
  notFound
);

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
  errorHandler
);

export default app;
