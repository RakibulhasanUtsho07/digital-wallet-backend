import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";

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

// Error middleware
import {
  notFound,
  errorHandler,
} from "./middlewares/errorMiddleware.js";

const app = express();

/* =========================================================
   CORS
========================================================= */

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

/* =========================================================
   BODY PARSERS
========================================================= */

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  })
);

/* =========================================================
   COOKIE
========================================================= */

app.use(cookieParser());

/* =========================================================
   RATE LIMIT
========================================================= */

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  max: 100,

  message: {
    success: false,
    message:
      "Too many requests from this IP, please try again after 15 minutes.",
  },
});

app.use(
  "/api/",
  apiLimiter
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
   HEALTH CHECK
========================================================= */

app.get(
  "/",
  (_req, res) => {
    res.status(200).json({
      status: "Success",
      message:
        "Digital Wallet API is running",
    });
  }
);

/* =========================================================
   ERROR HANDLING
========================================================= */

app.use(notFound);

app.use(errorHandler);

export default app;