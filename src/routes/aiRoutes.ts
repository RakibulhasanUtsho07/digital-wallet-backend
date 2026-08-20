import express from "express";
import { getSpendingInsights, getFraudRiskScore } from "../controllers/aiController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/insights", protect, getSpendingInsights);
router.get("/fraud-score", protect, getFraudRiskScore);

export default router;