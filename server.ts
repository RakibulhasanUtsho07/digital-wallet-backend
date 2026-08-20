import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import transactionRoutes from "./src/routes/transactionRoutes.js";
// Route Imports
import authRoutes from "./src/routes/authRoutes.js";
import walletRoutes from "./src/routes/walletRoutes.js";
import transferRoutes from "./src/routes/transferRoutes.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Database Connection
mongoose
  .connect(process.env.MONGO_URI as string)
  .then(() => console.log("MongoDB Connected Successfully"))
  .catch((err) => console.error("Database connection error:", err));

// Define API Routes
app.use("/api/auth", authRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/transfers", transferRoutes);

app.get("/", (req, res) => {
  res.status(200).json({ status: "Success", message: "TypeScript Digital Wallet API Running" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));