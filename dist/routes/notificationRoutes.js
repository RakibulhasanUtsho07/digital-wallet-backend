"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const notificationController_js_1 = require("../controllers/notificationController.js");
const authMiddleware_js_1 = require("../middlewares/authMiddleware.js");
const router = express_1.default.Router();
/* Preferences and collection actions must be declared before /:id. */
router.get("/preferences", authMiddleware_js_1.protect, notificationController_js_1.getNotificationPreferences);
router.put("/preferences", authMiddleware_js_1.protect, notificationController_js_1.updateNotificationPreferences);
router.patch("/read-all", authMiddleware_js_1.protect, notificationController_js_1.markAllNotificationsAsRead);
router.post("/bulk", authMiddleware_js_1.protect, notificationController_js_1.bulkNotificationAction);
router.get("/", authMiddleware_js_1.protect, notificationController_js_1.getUserNotifications);
router.get("/:id", authMiddleware_js_1.protect, notificationController_js_1.getNotificationById);
router.patch("/:id/read", authMiddleware_js_1.protect, notificationController_js_1.markNotificationAsRead);
router.patch("/:id/archive", authMiddleware_js_1.protect, notificationController_js_1.archiveNotification);
router.delete("/:id", authMiddleware_js_1.protect, notificationController_js_1.deleteNotification);
exports.default = router;
