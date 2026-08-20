import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import transactionRoutes from "./routes/transactionRoutes.js"; // <-- এই লাইনটি যুক্ত করা হয়েছে
import userRoutes from "./routes/userRoutes.js";
import kycRoutes from "./routes/kycRoutes.js";
import fundsRoutes from "./routes/fundsRoutes.js";

// Routes সেকশনে যোগ করুন:

const app = express();

// Middlewares
app.use(express.json());
app.use(cors());
app.use("/api/funds", fundsRoutes);

app.use("/api/kyc", kycRoutes);
// Routes
app.use("/api/transactions", transactionRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
// Health Check Route
app.get("/", (req, res) => {
  res.status(200).json({ status: "Success", message: "Digital Wallet API is running" });
});

export default app;