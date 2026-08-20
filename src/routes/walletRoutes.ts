import express from "express";
import { getWalletBalance } from "../controllers/walletController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/balance", protect, getWalletBalance);

export default router;