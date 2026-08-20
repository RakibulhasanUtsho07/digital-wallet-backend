import express from "express";
import { getAllUsers, getPendingKYCs, reviewKYC } from "../controllers/adminController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { adminOnly } from "../middlewares/adminMiddleware.js";

const router = express.Router();

router.get("/users", protect, adminOnly, getAllUsers);
router.get("/kyc/pending", protect, adminOnly, getPendingKYCs);
router.patch("/kyc/:id/review", protect, adminOnly, reviewKYC);

export default router;