"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPublicSupportTicket = createPublicSupportTicket;
const node_crypto_1 = require("node:crypto");
const SupportActivity_js_1 = require("../models/SupportActivity.js");
const SupportMessage_js_1 = require("../models/SupportMessage.js");
const SupportTicket_js_1 = require("../models/SupportTicket.js");
const User_js_1 = require("../models/User.js");
const crypto_js_1 = require("../utils/crypto.js");
const notificationService_js_1 = require("./notificationService.js");
const supportActivityService_js_1 = require("./supportActivityService.js");
const supportSlaService_js_1 = require("./supportSlaService.js");
const CATEGORY_MAP = {
    transfer: "Transfer",
    wallet: "Payment",
    account: "Account",
    verification: "KYC",
    other: "Other",
};
const SUBJECT_MAP = {
    transfer: "Transfer issue reported from landing page",
    wallet: "Wallet or balance issue reported from landing page",
    account: "Account access issue reported from landing page",
    verification: "Identity verification issue reported from landing page",
    other: "Support request submitted from landing page",
};
function createTicketNumber() {
    const date = new Date();
    const datePart = [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, "0"),
        String(date.getUTCDate()).padStart(2, "0"),
    ].join("");
    const randomPart = (0, node_crypto_1.randomBytes)(4).toString("hex").toUpperCase();
    return `COF-${datePart}-${randomPart}`;
}
async function findActiveCustomer(accountEmail) {
    const normalizedEmail = (0, crypto_js_1.normalizeEmail)(accountEmail);
    if (!normalizedEmail) {
        return null;
    }
    return User_js_1.User.findOne({
        emailLookup: (0, crypto_js_1.createLookupHash)(normalizedEmail),
        accountStatus: "active",
    })
        .select("_id name")
        .lean();
}
async function createPublicSupportTicket({ category, message, accountEmail, }) {
    const cleanMessage = message.replace(/\s+/g, " ").trim().slice(0, 600);
    const cleanEmail = accountEmail.trim().toLowerCase();
    if (!CATEGORY_MAP[category]) {
        throw new Error("INVALID_CATEGORY");
    }
    if (cleanMessage.length < 10) {
        throw new Error("INVALID_MESSAGE");
    }
    const customer = await findActiveCustomer(cleanEmail);
    if (!customer) {
        throw new Error("CUSTOMER_NOT_FOUND");
    }
    const priority = "Normal";
    const now = new Date();
    let ticket = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            ticket = await SupportTicket_js_1.SupportTicket.create({
                ticketNumber: createTicketNumber(),
                customerUserId: customer._id,
                subject: SUBJECT_MAP[category],
                descriptionEncrypted: (0, crypto_js_1.encryptData)(cleanMessage),
                category: CATEGORY_MAP[category],
                priority,
                status: "Open",
                waitingOn: "admin",
                tags: ["landing-page"],
                source: "landing_page",
                slaDueAt: (0, supportSlaService_js_1.calculateSupportSlaDueAt)(priority, now),
                lastActivityAt: now,
                createdByUserId: customer._id,
            });
            break;
        }
        catch (error) {
            const mongoError = error;
            if (mongoError.code !== 11000 || attempt === 2) {
                throw error;
            }
        }
    }
    if (!ticket) {
        throw new Error("TICKET_CREATE_FAILED");
    }
    try {
        await SupportMessage_js_1.SupportMessage.create({
            ticketId: ticket._id,
            visibility: "public",
            authorType: "customer",
            authorUserId: customer._id,
            bodyEncrypted: (0, crypto_js_1.encryptData)(cleanMessage),
        });
        await (0, supportActivityService_js_1.recordSupportActivity)({
            ticketId: ticket._id.toString(),
            eventType: "TICKET_CREATED",
            summary: `Ticket ${ticket.ticketNumber} created from the landing page.`,
            actorUserId: customer._id.toString(),
            actorName: customer.name || "Customer",
        });
    }
    catch (error) {
        await Promise.allSettled([
            SupportMessage_js_1.SupportMessage.deleteMany({ ticketId: ticket._id }),
            SupportActivity_js_1.SupportActivity.deleteMany({ ticketId: ticket._id }),
            SupportTicket_js_1.SupportTicket.deleteOne({ _id: ticket._id }),
        ]);
        throw error;
    }
    try {
        await (0, notificationService_js_1.createNotification)({
            userId: customer._id,
            type: "SYSTEM",
            priority: "NORMAL",
            title: "Support ticket received",
            message: `${ticket.ticketNumber} has been added to the support queue.`,
            relatedEntityType: "SupportTicket",
            relatedEntityId: ticket._id,
            createdBy: "SYSTEM",
        });
    }
    catch (notificationError) {
        console.error("SUPPORT TICKET NOTIFICATION ERROR:", notificationError);
    }
    return {
        id: ticket._id.toString(),
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        createdAt: ticket.createdAt.toISOString(),
    };
}
