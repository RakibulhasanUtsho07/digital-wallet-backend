"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupportOverview = void 0;
const SupportTicket_js_1 = require("../models/SupportTicket.js");
const getSupportOverview = async () => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueSoon = new Date(now.getTime() +
        15 *
            60 *
            1000);
    const [openTickets, pendingReplies, slaRisk, breached, resolvedToday, unassigned, escalated, priorityWaiting, csatRows,] = await Promise.all([
        SupportTicket_js_1.SupportTicket.countDocuments({
            status: {
                $ne: "Resolved",
            },
        }),
        SupportTicket_js_1.SupportTicket.countDocuments({
            status: {
                $ne: "Resolved",
            },
            waitingOn: "admin",
        }),
        SupportTicket_js_1.SupportTicket.countDocuments({
            status: {
                $ne: "Resolved",
            },
            slaDueAt: {
                $gt: now,
                $lte: dueSoon,
            },
        }),
        SupportTicket_js_1.SupportTicket.countDocuments({
            status: {
                $ne: "Resolved",
            },
            slaDueAt: {
                $lte: now,
            },
        }),
        SupportTicket_js_1.SupportTicket.countDocuments({
            resolvedAt: {
                $gte: startOfToday,
            },
        }),
        SupportTicket_js_1.SupportTicket.countDocuments({
            status: {
                $ne: "Resolved",
            },
            assigneeAdminId: {
                $exists: false,
            },
        }),
        SupportTicket_js_1.SupportTicket.countDocuments({
            status: "Escalated",
        }),
        SupportTicket_js_1.SupportTicket.countDocuments({
            status: {
                $ne: "Resolved",
            },
            waitingOn: "admin",
            priority: {
                $in: [
                    "Urgent",
                    "High",
                ],
            },
        }),
        SupportTicket_js_1.SupportTicket.aggregate([
            {
                $match: {
                    csatScore: {
                        $exists: true,
                    },
                },
            },
            {
                $group: {
                    _id: null,
                    average: {
                        $avg: "$csatScore",
                    },
                },
            },
        ]),
    ]);
    const csat = csatRows[0]
        ?.average;
    return {
        metrics: {
            openTickets,
            pendingReplies,
            slaRisk,
            breached,
            resolvedToday,
            csat: typeof csat ===
                "number"
                ? Number(csat.toFixed(1))
                : null,
            unassigned,
            escalated,
        },
        attention: {
            slaDueSoon: slaRisk,
            priorityWaiting,
            escalated,
            unassigned,
        },
    };
};
exports.getSupportOverview = getSupportOverview;
