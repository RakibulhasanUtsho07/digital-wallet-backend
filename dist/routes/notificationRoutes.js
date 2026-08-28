"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const notificationController_js_1 = require("../controllers/notificationController.js");
const authMiddleware_js_1 = require("../middlewares/authMiddleware.js");
const router = express_1.default.Router();
router.get("/", authMiddleware_js_1.protect, notificationController_js_1.getUserNotifications);
router.patch("/:id/read", authMiddleware_js_1.protect, notificationController_js_1.markNotificationAsRead);
exports.default = router;
