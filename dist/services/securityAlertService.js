"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dispatchSecurityAlert = void 0;
const Notification_js_1 = require("../models/Notification.js");
const SecurityPreferences_js_1 = require("../models/SecurityPreferences.js");
const dispatchSecurityAlert = async ({ userId, kind, title, message, }) => {
    try {
        const preferences = await SecurityPreferences_js_1.SecurityPreferences.findOne({
            userId,
        }).select("alerts");
        const enabled = preferences?.alerts?.[kind] ??
            true;
        if (!enabled) {
            return;
        }
        await Notification_js_1.Notification.create({
            userId,
            title: title.slice(0, 160),
            message: message.slice(0, 500),
            type: "SYSTEM",
            isRead: false,
        });
    }
    catch (error) {
        /* Alerts must never block authentication. */
        console.error("SECURITY ALERT DELIVERY ERROR:", error);
    }
};
exports.dispatchSecurityAlert = dispatchSecurityAlert;
