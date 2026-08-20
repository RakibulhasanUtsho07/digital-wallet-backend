import express from "express";
import { sendMoney } from "../controllers/transferController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/send", protect, sendMoney);

export default router;