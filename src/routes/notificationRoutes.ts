import express from "express";
import { getUserNotifications, markNotificationAsRead } from "../controllers/notificationController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getUserNotifications);
router.patch("/:id/read", protect, markNotificationAsRead);

export default router;