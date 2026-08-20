import express from "express";
import { getTransactionHistory } from "../controllers/transactionController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/history", protect, getTransactionHistory);

export default router;