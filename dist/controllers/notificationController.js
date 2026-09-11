"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateNotificationPreferences = exports.getNotificationPreferences = exports.bulkNotificationAction = exports.deleteNotification = exports.archiveNotification = exports.markAllNotificationsAsRead = exports.markNotificationAsRead = exports.getNotificationById = exports.getUserNotifications = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Notification_js_1 = require("../models/Notification.js");
const NotificationPreference_js_1 = require("../models/NotificationPreference.js");
const crypto_js_1 = require("../utils/crypto.js");
const DEFAULT_PREFERENCES = {
    channels: {
        inApp: true,
        email: true,
        push: false,
    },
    categories: {
        security: true,
        transaction: true,
        budget: true,
        kyc: true,
        receipt: true,
        system: true,
    },
    quietHours: {
        enabled: false,
        start: "22:00",
        end: "07:00",
    },
    digest: "daily",
};
function setPrivateNoStore(res) {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
}
function decryptValue(value) {
    if (!value ||
        typeof value !==
            "object") {
        return "";
    }
    const data = value;
    if (typeof data.encrypted !==
        "string" ||
        typeof data.iv !==
            "string" ||
        typeof data.authTag !==
            "string") {
        return "";
    }
    try {
        return (0, crypto_js_1.decryptData)({
            encrypted: data.encrypted,
            iv: data.iv,
            authTag: data.authTag,
        });
    }
    catch (error) {
        console.error("NOTIFICATION DECRYPT ERROR:", error instanceof Error
            ? error.message
            : error);
        return "";
    }
}
function decryptAmount(value, fallback) {
    const decrypted = decryptValue(value);
    if (!decrypted) {
        return fallback;
    }
    const minorUnits = Number(decrypted);
    if (!Number.isSafeInteger(minorUnits) ||
        minorUnits < 0) {
        return fallback;
    }
    return minorUnits /
        100;
}
function normalizeType(value) {
    switch (value) {
        case "SECURITY":
            return "security";
        case "BUDGET":
            return "budget";
        case "KYC":
            return "kyc";
        case "RECEIPT":
            return "receipt";
        case "TRANSFER":
        case "DEPOSIT":
        case "WITHDRAW":
        case "TRANSACTION":
            return "transaction";
        default:
            return "system";
    }
}
function normalizePriority(value) {
    switch (value) {
        case "CRITICAL":
            return "critical";
        case "HIGH":
            return "high";
        case "LOW":
            return "low";
        default:
            return "normal";
    }
}
function notificationDTO(notification) {
    const amount = notification.amountEncrypted
        ? decryptAmount(notification.amountEncrypted)
        : typeof notification.amount ===
            "number"
            ? notification.amount
            : undefined;
    const merchant = decryptValue(notification.merchantEncrypted) ||
        notification.merchant ||
        undefined;
    return {
        id: String(notification._id),
        type: normalizeType(notification.type),
        priority: normalizePriority(notification.priority),
        title: decryptValue(notification.titleEncrypted) ||
            notification.title ||
            "Notification",
        message: decryptValue(notification.messageEncrypted) ||
            notification.message ||
            "",
        date: new Date(notification.createdAt ||
            notification.updatedAt ||
            Date.now()).toISOString(),
        isRead: Boolean(notification.isRead),
        isArchived: Boolean(notification.isArchived),
        actionLink: notification.actionLink ||
            undefined,
        actionText: notification.actionText ||
            undefined,
        amount,
        currency: amount !==
            undefined
            ? "৳"
            : undefined,
        merchant,
    };
}
function getId(req) {
    const rawId = req.params.id;
    const id = Array.isArray(rawId)
        ? rawId[0]
        : rawId;
    if (typeof id !==
        "string" ||
        !mongoose_1.default.Types.ObjectId.isValid(id)) {
        return null;
    }
    return id;
}
function isTimeValue(value) {
    return (typeof value ===
        "string" &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
}
/* =========================================================
   GET /api/notifications
========================================================= */
const getUserNotifications = async (req, res) => {
    try {
        setPrivateNoStore(res);
        const userId = req.user?._id;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: "Not authorized",
            });
            return;
        }
        const notifications = await Notification_js_1.Notification.find({
            userId,
        })
            .sort({
            createdAt: -1,
        })
            .limit(500)
            .lean();
        const safeNotifications = notifications.map(notificationDTO);
        const unreadCount = safeNotifications.filter((notification) => !notification.isRead &&
            !notification.isArchived).length;
        res.status(200).json({
            success: true,
            unreadCount,
            count: safeNotifications.length,
            notifications: safeNotifications,
        });
    }
    catch (error) {
        console.error("GET NOTIFICATIONS ERROR:", error instanceof Error
            ? error.message
            : error);
        res.status(500).json({
            success: false,
            message: "Failed to load notifications.",
        });
    }
};
exports.getUserNotifications = getUserNotifications;
/* =========================================================
   GET /api/notifications/:id
========================================================= */
const getNotificationById = async (req, res) => {
    try {
        setPrivateNoStore(res);
        const userId = req.user?._id;
        const id = getId(req);
        if (!userId ||
            !id) {
            res.status(userId
                ? 400
                : 401).json({
                success: false,
                message: userId
                    ? "Invalid notification ID."
                    : "Not authorized",
            });
            return;
        }
        const notification = await Notification_js_1.Notification.findOne({
            _id: id,
            userId,
        }).lean();
        if (!notification) {
            res.status(404).json({
                success: false,
                message: "Notification not found.",
            });
            return;
        }
        res.status(200).json({
            success: true,
            notification: notificationDTO(notification),
        });
    }
    catch (error) {
        console.error("GET NOTIFICATION ERROR:", error instanceof Error
            ? error.message
            : error);
        res.status(500).json({
            success: false,
            message: "Failed to load notification.",
        });
    }
};
exports.getNotificationById = getNotificationById;
/* =========================================================
   PATCH /api/notifications/:id/read
========================================================= */
const markNotificationAsRead = async (req, res) => {
    try {
        setPrivateNoStore(res);
        const userId = req.user?._id;
        const id = getId(req);
        if (!userId ||
            !id) {
            res.status(userId
                ? 400
                : 401).json({
                success: false,
                message: userId
                    ? "Invalid notification ID."
                    : "Not authorized",
            });
            return;
        }
        const notification = await Notification_js_1.Notification.findOneAndUpdate({
            _id: id,
            userId,
        }, {
            $set: {
                isRead: true,
            },
        }, {
            new: true,
        });
        if (!notification) {
            res.status(404).json({
                success: false,
                message: "Notification not found.",
            });
            return;
        }
        res.status(200).json({
            success: true,
            message: "Notification marked as read.",
            notification: notificationDTO(notification),
        });
    }
    catch (error) {
        console.error("MARK NOTIFICATION READ ERROR:", error instanceof Error
            ? error.message
            : error);
        res.status(500).json({
            success: false,
            message: "Failed to update notification.",
        });
    }
};
exports.markNotificationAsRead = markNotificationAsRead;
/* =========================================================
   PATCH /api/notifications/read-all
========================================================= */
const markAllNotificationsAsRead = async (req, res) => {
    try {
        setPrivateNoStore(res);
        const userId = req.user?._id;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: "Not authorized",
            });
            return;
        }
        const result = await Notification_js_1.Notification.updateMany({
            userId,
            isArchived: false,
            isRead: false,
        }, {
            $set: {
                isRead: true,
            },
        });
        res.status(200).json({
            success: true,
            message: "All notifications marked as read.",
            modifiedCount: result.modifiedCount,
        });
    }
    catch (error) {
        console.error("MARK ALL NOTIFICATIONS READ ERROR:", error instanceof Error
            ? error.message
            : error);
        res.status(500).json({
            success: false,
            message: "Failed to update notifications.",
        });
    }
};
exports.markAllNotificationsAsRead = markAllNotificationsAsRead;
/* =========================================================
   PATCH /api/notifications/:id/archive
========================================================= */
const archiveNotification = async (req, res) => {
    try {
        setPrivateNoStore(res);
        const userId = req.user?._id;
        const id = getId(req);
        if (!userId ||
            !id) {
            res.status(userId
                ? 400
                : 401).json({
                success: false,
                message: userId
                    ? "Invalid notification ID."
                    : "Not authorized",
            });
            return;
        }
        const notification = await Notification_js_1.Notification.findOneAndUpdate({
            _id: id,
            userId,
        }, {
            $set: {
                isArchived: true,
                isRead: true,
            },
        }, {
            new: true,
        });
        if (!notification) {
            res.status(404).json({
                success: false,
                message: "Notification not found.",
            });
            return;
        }
        res.status(200).json({
            success: true,
            message: "Notification archived.",
            notification: notificationDTO(notification),
        });
    }
    catch (error) {
        console.error("ARCHIVE NOTIFICATION ERROR:", error instanceof Error
            ? error.message
            : error);
        res.status(500).json({
            success: false,
            message: "Failed to archive notification.",
        });
    }
};
exports.archiveNotification = archiveNotification;
/* =========================================================
   DELETE /api/notifications/:id
========================================================= */
const deleteNotification = async (req, res) => {
    try {
        setPrivateNoStore(res);
        const userId = req.user?._id;
        const id = getId(req);
        if (!userId ||
            !id) {
            res.status(userId
                ? 400
                : 401).json({
                success: false,
                message: userId
                    ? "Invalid notification ID."
                    : "Not authorized",
            });
            return;
        }
        const deleted = await Notification_js_1.Notification.findOneAndDelete({
            _id: id,
            userId,
        });
        if (!deleted) {
            res.status(404).json({
                success: false,
                message: "Notification not found.",
            });
            return;
        }
        res.status(200).json({
            success: true,
            message: "Notification deleted.",
            id,
        });
    }
    catch (error) {
        console.error("DELETE NOTIFICATION ERROR:", error instanceof Error
            ? error.message
            : error);
        res.status(500).json({
            success: false,
            message: "Failed to delete notification.",
        });
    }
};
exports.deleteNotification = deleteNotification;
/* =========================================================
   POST /api/notifications/bulk
========================================================= */
const bulkNotificationAction = async (req, res) => {
    try {
        setPrivateNoStore(res);
        const userId = req.user?._id;
        const ids = Array.isArray(req.body?.ids)
            ? req.body.ids
                .filter((id) => typeof id ===
                "string" &&
                mongoose_1.default.Types.ObjectId.isValid(id))
                .slice(0, 100)
            : [];
        const action = req.body?.action;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: "Not authorized",
            });
            return;
        }
        if (ids.length === 0 ||
            ![
                "read",
                "archive",
                "delete",
            ].includes(action)) {
            res.status(400).json({
                success: false,
                message: "Valid notification IDs and action are required.",
            });
            return;
        }
        const query = {
            _id: {
                $in: ids,
            },
            userId,
        };
        let modifiedCount = 0;
        if (action ===
            "delete") {
            const result = await Notification_js_1.Notification.deleteMany(query);
            modifiedCount =
                result.deletedCount;
        }
        else {
            const update = action ===
                "archive"
                ? {
                    $set: {
                        isArchived: true,
                        isRead: true,
                    },
                }
                : {
                    $set: {
                        isRead: true,
                    },
                };
            const result = await Notification_js_1.Notification.updateMany(query, update);
            modifiedCount =
                result.modifiedCount;
        }
        res.status(200).json({
            success: true,
            message: `Bulk ${action} completed.`,
            modifiedCount,
        });
    }
    catch (error) {
        console.error("BULK NOTIFICATION ERROR:", error instanceof Error
            ? error.message
            : error);
        res.status(500).json({
            success: false,
            message: "Failed to update notifications.",
        });
    }
};
exports.bulkNotificationAction = bulkNotificationAction;
/* =========================================================
   GET /api/notifications/preferences
========================================================= */
const getNotificationPreferences = async (req, res) => {
    try {
        setPrivateNoStore(res);
        const userId = req.user?._id;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: "Not authorized",
            });
            return;
        }
        const preference = await NotificationPreference_js_1.NotificationPreference.findOneAndUpdate({
            userId,
        }, {
            $setOnInsert: {
                userId,
                ...DEFAULT_PREFERENCES,
            },
        }, {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
        }).lean();
        res.status(200).json({
            success: true,
            preferences: {
                channels: preference.channels,
                categories: {
                    ...preference.categories,
                    security: true,
                },
                quietHours: preference.quietHours,
                digest: preference.digest,
            },
        });
    }
    catch (error) {
        console.error("GET NOTIFICATION PREFERENCES ERROR:", error instanceof Error
            ? error.message
            : error);
        res.status(500).json({
            success: false,
            message: "Failed to load notification preferences.",
        });
    }
};
exports.getNotificationPreferences = getNotificationPreferences;
/* =========================================================
   PUT /api/notifications/preferences
========================================================= */
const updateNotificationPreferences = async (req, res) => {
    try {
        setPrivateNoStore(res);
        const userId = req.user?._id;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: "Not authorized",
            });
            return;
        }
        const body = req.body || {};
        const channels = {
            inApp: body.channels?.inApp !==
                false,
            email: body.channels?.email !==
                false,
            push: body.channels?.push ===
                true,
        };
        const categories = {
            security: true,
            transaction: body.categories?.transaction !==
                false,
            budget: body.categories?.budget !==
                false,
            kyc: body.categories?.kyc !==
                false,
            receipt: body.categories?.receipt !==
                false,
            system: body.categories?.system !==
                false,
        };
        const quietHours = {
            enabled: body.quietHours?.enabled ===
                true,
            start: isTimeValue(body.quietHours?.start)
                ? body.quietHours.start
                : "22:00",
            end: isTimeValue(body.quietHours?.end)
                ? body.quietHours.end
                : "07:00",
        };
        const digest = [
            "off",
            "daily",
            "weekly",
        ].includes(body.digest)
            ? body.digest
            : "daily";
        const preference = await NotificationPreference_js_1.NotificationPreference.findOneAndUpdate({
            userId,
        }, {
            $set: {
                channels,
                categories,
                quietHours,
                digest,
            },
        }, {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
        }).lean();
        res.status(200).json({
            success: true,
            message: "Notification preferences saved.",
            preferences: {
                channels: preference.channels,
                categories: {
                    ...preference.categories,
                    security: true,
                },
                quietHours: preference.quietHours,
                digest: preference.digest,
            },
        });
    }
    catch (error) {
        console.error("UPDATE NOTIFICATION PREFERENCES ERROR:", error instanceof Error
            ? error.message
            : error);
        res.status(500).json({
            success: false,
            message: "Failed to save notification preferences.",
        });
    }
};
exports.updateNotificationPreferences = updateNotificationPreferences;
