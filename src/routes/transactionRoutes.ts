import express from "express";
import { getMyTransactions, getTransactionById } from "../controllers/transactionController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getMyTransactions);
router.get("/:id", protect, getTransactionById);

export default router;