import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import transactionRoutes from "./routes/transactionRoutes.js"; // <-- এই লাইনটি যুক্ত করা হয়েছে
import userRoutes from "./routes/userRoutes.js";
import kycRoutes from "./routes/kycRoutes.js";
import fundsRoutes from "./routes/fundsRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import aiRoutes from "./routes/aiRoutes.js"
import notificationRoutes from "./routes/notificationRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";
import budgetRoutes from "./routes/budgetRoutes.js";
import auditRoutes from "./routes/auditRoutes.js";

// Routes সেকশনে যোগ করুন:

const app = express();

// Middlewares
app.use(express.json());
app.use(cors());
app.use("/api/funds", fundsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/kyc", kycRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/budgets", budgetRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/admin/audit-logs", auditRoutes);
// Routes
app.use("/api/transactions", transactionRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
// Health Check Route
app.get("/", (req, res) => {
  res.status(200).json({ status: "Success", message: "Digital Wallet API is running" });
});

export default app;