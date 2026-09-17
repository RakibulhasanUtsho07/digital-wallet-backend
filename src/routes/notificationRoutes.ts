import express from "express";

import {
  archiveNotification,
  bulkNotificationAction,
  deleteNotification,
  getNotificationById,
  getNotificationPreferences,
  getUserNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  updateNotificationPreferences,
} from "../controllers/notificationController.js";

import {
  protect,
} from "../middlewares/authMiddleware.js";

const router =
  express.Router();

/* Preferences and collection actions must be declared before /:id. */
router.get(
  "/preferences",
  protect,
  getNotificationPreferences
);

router.put(
  "/preferences",
  protect,
  updateNotificationPreferences
);

router.patch(
  "/read-all",
  protect,
  markAllNotificationsAsRead
);

router.post(
  "/bulk",
  protect,
  bulkNotificationAction
);

router.get(
  "/",
  protect,
  getUserNotifications
);

router.get(
  "/:id",
  protect,
  getNotificationById
);

router.patch(
  "/:id/read",
  protect,
  markNotificationAsRead
);

router.patch(
  "/:id/archive",
  protect,
  archiveNotification
);

router.delete(
  "/:id",
  protect,
  deleteNotification
);

export default router;
