"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordSupportActivity = void 0;
const SupportActivity_js_1 = require("../models/SupportActivity.js");
const recordSupportActivity = async ({ ticketId, eventType, summary, actorAdminId, actorUserId, actorName, }) => {
    await SupportActivity_js_1.SupportActivity.create({
        ticketId,
        eventType,
        summary: summary
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 240),
        actorAdminId,
        actorUserId,
        actorName: actorName
            .trim()
            .slice(0, 120),
    });
};
exports.recordSupportActivity = recordSupportActivity;
