"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markNotificationAsRead = exports.getUserNotifications = void 0;
const Notification_js_1 = require("../models/Notification.js");
// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
const getUserNotifications = async (req, res) => {
    try {
        const userId = req.user?._id;
        const notifications = await Notification_js_1.Notification.find({ userId }).sort({ createdAt: -1 });
        const unreadCount = await Notification_js_1.Notification.countDocuments({ userId, isRead: false });
        res.status(200).json({
            success: true,
            unreadCount,
            count: notifications.length,
            notifications,
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getUserNotifications = getUserNotifications;
// @desc    Mark notification as read
// @route   PATCH /api/notifications/:id/read
// @access  Private
const markNotificationAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?._id;
        const notification = await Notification_js_1.Notification.findOne({ _id: id, userId });
        if (!notification) {
            res.status(404).json({ message: "Notification not found" });
            return;
        }
        notification.isRead = true;
        await notification.save();
        res.status(200).json({ success: true, message: "Notification marked as read" });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.markNotificationAsRead = markNotificationAsRead;
