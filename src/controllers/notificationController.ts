import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import { Notification } from "../models/Notification.js";

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
export const getUserNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;

    const notifications = await Notification.find({ userId }).sort({ createdAt: -1 });
    const unreadCount = await Notification.countDocuments({ userId, isRead: false });

    res.status(200).json({
      success: true,
      unreadCount,
      count: notifications.length,
      notifications,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mark notification as read
// @route   PATCH /api/notifications/:id/read
// @access  Private
export const markNotificationAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?._id;

    const notification = await Notification.findOne({ _id: id, userId });
    if (!notification) {
      res.status(404).json({ message: "Notification not found" });
      return;
    }

    notification.isRead = true;
    await notification.save();

    res.status(200).json({ success: true, message: "Notification marked as read" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};