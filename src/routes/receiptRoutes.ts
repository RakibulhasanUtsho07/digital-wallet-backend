import express from "express";
import { addReceipt, getReceipts } from "../controllers/receiptController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/", protect, addReceipt);
router.get("/", protect, getReceipts);

export default router;