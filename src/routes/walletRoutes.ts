import express from "express";
import { getMyWallet } from "../controllers/walletController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getMyWallet);

export default router;