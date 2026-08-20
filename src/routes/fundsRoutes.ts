import express from "express";
import { depositFunds, withdrawFunds } from "../controllers/fundsController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/deposit", protect, depositFunds);
router.post("/withdraw", protect, withdrawFunds);

export default router;