import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit"; // <-- নতুন যুক্ত হলো

// রাউট ইমপোর্টস
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

// মিডলওয়্যার ইমপোর্টস
import { notFound, errorHandler } from "./middlewares/errorMiddleware.js"; // <-- নতুন যুক্ত হলো

const app = express();

// Middlewares
app.use(express.json());
app.use(cors());

// Rate Limiting (SECURITY + RELIABILITY)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // ১৫ মিনিট
  max: 100, // প্রতি ১৫ মিনিটে একটি IP থেকে সর্বোচ্চ ১০০টি রিকোয়েস্ট
  message: { message: "Too many requests from this IP, please try again after 15 minutes" },
});

// সব /api/ রাউটের জন্য Rate Limiter অ্যাপ্লাই করা হলো
app.use("/api/", apiLimiter);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/funds", fundsRoutes);
app.use("/api/transfers", transferRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/kyc", kycRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/audit-logs", auditRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/budgets", budgetRoutes);
app.use("/api/receipts", receiptRoutes);

// Health Check Route
app.get("/", (req, res) => {
  res.status(200).json({ status: "Success", message: "Digital Wallet API is running" });
});

// Error Handling Middlewares (অবশ্যই রাউটগুলোর একদম শেষে দিতে হবে)
app.use(notFound);
app.use(errorHandler);

export default app;