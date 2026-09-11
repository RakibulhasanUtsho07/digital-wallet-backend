"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveSupportTicket = exports.escalateSupportTicket = exports.addAdminSupportMessage = exports.updateSupportTicket = exports.getSupportTicketDetail = exports.listSupportTickets = exports.buildSupportTicketQuery = exports.createSupportTicket = void 0;
const crypto_1 = __importDefault(require("crypto"));
const mongoose_1 = __importDefault(require("mongoose"));
const SupportTicket_js_1 = require("../models/SupportTicket.js");
const SupportMessage_js_1 = require("../models/SupportMessage.js");
const SupportActivity_js_1 = require("../models/SupportActivity.js");
const User_js_1 = require("../models/User.js");
const crypto_js_1 = require("../utils/crypto.js");
const supportSlaService_js_1 = require("./supportSlaService.js");
const supportActivityService_js_1 = require("./supportActivityService.js");
const VALID_STATUS = [
    "Open",
    "Waiting for Customer",
    "In Progress",
    "Escalated",
    "Resolved",
];
const VALID_PRIORITY = [
    "Low",
    "Normal",
    "High",
    "Urgent",
];
const VALID_CATEGORY = [
    "Transfer",
    "Withdrawal",
    "Deposit",
    "KYC",
    "Security",
    "Account",
    "Payment",
    "Other",
];
const decryptSafe = (value) => {
    if (!value) {
        return "";
    }
    try {
        return (0, crypto_js_1.decryptData)(value);
    }
    catch {
        return "";
    }
};
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalizeTags = (value) => {
    if (!Array.isArray(value)) {
        return [];
    }
    return Array.from(new Set(value
        .filter((item) => typeof item ===
        "string")
        .map((item) => item
        .trim()
        .slice(0, 40))
        .filter(Boolean))).slice(0, 12);
};
const createTicketNumber = () => `SUP-${Date.now()
    .toString()
    .slice(-6)}${crypto_1.default.randomInt(100, 1000)}`;
const getAdminName = async (adminId) => {
    const admin = await User_js_1.User.findOne({
        _id: adminId,
        role: "admin",
        accountStatus: "active",
    })
        .select("name")
        .lean();
    return admin?.name ??
        "Administrator";
};
const findCustomerByEmail = async (email) => {
    const normalized = (0, crypto_js_1.normalizeEmail)(email);
    if (!normalized) {
        return null;
    }
    return User_js_1.User.findOne({
        emailLookup: (0, crypto_js_1.createLookupHash)(normalized),
        accountStatus: "active",
    });
};
const mapAssignee = (admin) => ({
    id: admin
        ? admin._id.toString()
        : null,
    name: admin?.name ??
        "Unassigned",
});
const createSupportTicket = async ({ customerEmail, subject, description, category, priority, relatedReference, tags, adminId, }) => {
    const customer = await findCustomerByEmail(customerEmail);
    if (!customer) {
        throw new Error("CUSTOMER_NOT_FOUND");
    }
    if (!VALID_CATEGORY.includes(category)) {
        throw new Error("INVALID_CATEGORY");
    }
    if (!VALID_PRIORITY.includes(priority)) {
        throw new Error("INVALID_PRIORITY");
    }
    const cleanSubject = subject
        .trim()
        .slice(0, 180);
    const cleanDescription = description
        .trim()
        .slice(0, 4000);
    if (cleanSubject.length <
        4 ||
        cleanDescription.length <
            4) {
        throw new Error("INVALID_CONTENT");
    }
    const adminName = await getAdminName(adminId);
    let ticket = null;
    for (let attempt = 0; attempt <
        3; attempt +=
        1) {
        try {
            ticket =
                await SupportTicket_js_1.SupportTicket.create({
                    ticketNumber: createTicketNumber(),
                    customerUserId: customer._id,
                    subject: cleanSubject,
                    descriptionEncrypted: (0, crypto_js_1.encryptData)(cleanDescription),
                    category,
                    priority,
                    status: "Open",
                    waitingOn: "admin",
                    relatedReference: relatedReference
                        ?.trim()
                        .slice(0, 180),
                    tags: normalizeTags(tags),
                    slaDueAt: (0, supportSlaService_js_1.calculateSupportSlaDueAt)(priority),
                    lastActivityAt: new Date(),
                    createdByAdminId: adminId,
                });
            break;
        }
        catch (error) {
            if (error?.code !==
                11000 ||
                attempt ===
                    2) {
                throw error;
            }
        }
    }
    if (!ticket) {
        throw new Error("TICKET_CREATE_FAILED");
    }
    await (0, supportActivityService_js_1.recordSupportActivity)({
        ticketId: ticket._id.toString(),
        eventType: "TICKET_CREATED",
        summary: `Ticket ${ticket.ticketNumber} created.`,
        actorAdminId: adminId,
        actorName: adminName,
    });
    return ticket;
};
exports.createSupportTicket = createSupportTicket;
const buildSupportTicketQuery = async ({ search, status, priority, category, sla, }) => {
    const query = {};
    if (status &&
        VALID_STATUS.includes(status)) {
        query.status =
            status;
    }
    if (priority &&
        VALID_PRIORITY.includes(priority)) {
        query.priority =
            priority;
    }
    if (category &&
        VALID_CATEGORY.includes(category)) {
        query.category =
            category;
    }
    const now = new Date();
    if (sla ===
        "Due Soon") {
        query.status = {
            $ne: "Resolved",
        };
        query.slaDueAt = {
            $gt: now,
            $lte: new Date(now.getTime() +
                15 *
                    60 *
                    1000),
        };
    }
    if (sla ===
        "Breached") {
        query.status = {
            $ne: "Resolved",
        };
        query.slaDueAt = {
            $lte: now,
        };
    }
    const cleanSearch = search
        ?.trim()
        .slice(0, 120);
    if (cleanSearch) {
        const or = [
            {
                ticketNumber: {
                    $regex: escapeRegex(cleanSearch),
                    $options: "i",
                },
            },
            {
                subject: {
                    $regex: escapeRegex(cleanSearch),
                    $options: "i",
                },
            },
            {
                relatedReference: {
                    $regex: escapeRegex(cleanSearch),
                    $options: "i",
                },
            },
        ];
        if (cleanSearch.includes("@")) {
            const normalized = (0, crypto_js_1.normalizeEmail)(cleanSearch);
            if (normalized) {
                const customer = await User_js_1.User.findOne({
                    emailLookup: (0, crypto_js_1.createLookupHash)(normalized),
                })
                    .select("_id")
                    .lean();
                if (customer) {
                    or.push({
                        customerUserId: customer._id,
                    });
                }
            }
        }
        else {
            const users = await User_js_1.User.find({
                name: {
                    $regex: escapeRegex(cleanSearch),
                    $options: "i",
                },
            })
                .select("_id")
                .limit(20)
                .lean();
            if (users.length) {
                or.push({
                    customerUserId: {
                        $in: users.map((user) => user._id),
                    },
                });
            }
        }
        query.$or =
            or;
    }
    return query;
};
exports.buildSupportTicketQuery = buildSupportTicketQuery;
const loadUserMaps = async (tickets) => {
    const customerIds = Array.from(new Set(tickets.map((ticket) => ticket.customerUserId.toString())));
    const adminIds = Array.from(new Set(tickets
        .map((ticket) => ticket.assigneeAdminId?.toString())
        .filter(Boolean)));
    const [customers, admins,] = await Promise.all([
        customerIds.length
            ? User_js_1.User.find({
                _id: {
                    $in: customerIds,
                },
            })
                .select("name emailEncrypted kycStatus walletId")
                .lean()
            : [],
        adminIds.length
            ? User_js_1.User.find({
                _id: {
                    $in: adminIds,
                },
                role: "admin",
            })
                .select("name")
                .lean()
            : [],
    ]);
    return {
        customerMap: new Map(customers.map((user) => [
            user._id.toString(),
            user,
        ])),
        adminMap: new Map(admins.map((user) => [
            user._id.toString(),
            user,
        ])),
    };
};
const listSupportTickets = async ({ query, page, limit, }) => {
    const skip = (page -
        1) *
        limit;
    const [tickets, total,] = await Promise.all([
        SupportTicket_js_1.SupportTicket.find(query)
            .sort({
            lastActivityAt: -1,
        })
            .skip(skip)
            .limit(limit)
            .lean(),
        SupportTicket_js_1.SupportTicket.countDocuments(query),
    ]);
    const { customerMap, adminMap, } = await loadUserMaps(tickets);
    return {
        tickets: tickets.map((ticket) => {
            const customer = customerMap.get(ticket.customerUserId.toString());
            const admin = ticket.assigneeAdminId
                ? adminMap.get(ticket.assigneeAdminId.toString())
                : null;
            const slaMinutes = (0, supportSlaService_js_1.getSupportSlaRemainingMinutes)(new Date(ticket.slaDueAt));
            return {
                id: ticket._id.toString(),
                ticketNumber: ticket.ticketNumber,
                customerUserId: ticket.customerUserId.toString(),
                customerName: customer?.name ??
                    "Unknown customer",
                customerEmail: decryptSafe(customer?.emailEncrypted),
                subject: ticket.subject,
                category: ticket.category,
                priority: ticket.priority,
                status: ticket.status,
                waitingOn: ticket.waitingOn,
                assignee: mapAssignee(admin),
                slaMinutes,
                slaBreached: ticket.status !==
                    "Resolved" &&
                    slaMinutes <=
                        0,
                lastActivityAt: new Date(ticket.lastActivityAt).toISOString(),
                createdAt: new Date(ticket.createdAt).toISOString(),
            };
        }),
        total,
    };
};
exports.listSupportTickets = listSupportTickets;
const getSupportTicketDetail = async (ticketId) => {
    if (!mongoose_1.default.Types.ObjectId.isValid(ticketId)) {
        return null;
    }
    const ticket = await SupportTicket_js_1.SupportTicket.findById(ticketId).lean();
    if (!ticket) {
        return null;
    }
    const [customer, assignee, messages, activity,] = await Promise.all([
        User_js_1.User.findById(ticket.customerUserId)
            .select("name emailEncrypted kycStatus walletId")
            .lean(),
        ticket.assigneeAdminId
            ? User_js_1.User.findById(ticket.assigneeAdminId)
                .select("name")
                .lean()
            : null,
        SupportMessage_js_1.SupportMessage.find({
            ticketId: ticket._id,
        })
            .sort({
            createdAt: 1,
        })
            .lean(),
        SupportActivity_js_1.SupportActivity.find({
            ticketId: ticket._id,
        })
            .sort({
            createdAt: -1,
        })
            .limit(100)
            .lean(),
    ]);
    if (!customer) {
        return null;
    }
    const authorIds = Array.from(new Set(messages
        .flatMap((message) => [
        message.authorAdminId?.toString(),
        message.authorUserId?.toString(),
    ])
        .filter(Boolean)));
    const authors = authorIds.length
        ? await User_js_1.User.find({
            _id: {
                $in: authorIds,
            },
        })
            .select("name")
            .lean()
        : [];
    const authorMap = new Map(authors.map((user) => [
        user._id.toString(),
        user.name,
    ]));
    const slaMinutes = (0, supportSlaService_js_1.getSupportSlaRemainingMinutes)(new Date(ticket.slaDueAt));
    return {
        id: ticket._id.toString(),
        ticketNumber: ticket.ticketNumber,
        customerUserId: ticket.customerUserId.toString(),
        customerName: customer.name,
        customerEmail: decryptSafe(customer.emailEncrypted),
        subject: ticket.subject,
        description: decryptSafe(ticket.descriptionEncrypted),
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        waitingOn: ticket.waitingOn,
        assignee: mapAssignee(assignee),
        slaMinutes,
        slaBreached: ticket.status !==
            "Resolved" &&
            slaMinutes <=
                0,
        lastActivityAt: new Date(ticket.lastActivityAt).toISOString(),
        createdAt: new Date(ticket.createdAt).toISOString(),
        relatedReference: ticket.relatedReference ??
            "",
        tags: ticket.tags ??
            [],
        customer: {
            userId: customer._id.toString(),
            name: customer.name,
            email: decryptSafe(customer.emailEncrypted),
            kycStatus: customer.kycStatus ??
                "not_started",
            walletLinked: Boolean(customer.walletId),
        },
        messages: messages.map((message) => ({
            id: message._id.toString(),
            visibility: message.visibility,
            authorType: message.authorType,
            authorName: message.authorAdminId
                ? authorMap.get(message.authorAdminId.toString()) ??
                    "Administrator"
                : message.authorUserId
                    ? authorMap.get(message.authorUserId.toString()) ??
                        customer.name
                    : "System",
            body: decryptSafe(message.bodyEncrypted),
            createdAt: new Date(message.createdAt).toISOString(),
        })),
        activity: activity.map((item) => ({
            id: item._id.toString(),
            eventType: item.eventType,
            summary: item.summary,
            actorName: item.actorName,
            createdAt: new Date(item.createdAt).toISOString(),
        })),
        firstResponseAt: ticket.firstResponseAt
            ? new Date(ticket.firstResponseAt).toISOString()
            : null,
        resolvedAt: ticket.resolvedAt
            ? new Date(ticket.resolvedAt).toISOString()
            : null,
    };
};
exports.getSupportTicketDetail = getSupportTicketDetail;
const updateSupportTicket = async ({ ticketId, adminId, status, priority, category, assigneeAdminId, tags, }) => {
    const ticket = await SupportTicket_js_1.SupportTicket.findById(ticketId);
    if (!ticket) {
        return null;
    }
    const adminName = await getAdminName(adminId);
    if (status !==
        undefined) {
        if (!VALID_STATUS.includes(status)) {
            throw new Error("INVALID_STATUS");
        }
        const previous = ticket.status;
        ticket.status =
            status;
        if (status ===
            "Resolved") {
            ticket.waitingOn =
                "none";
            ticket.resolvedAt =
                new Date();
        }
        else if (previous ===
            "Resolved") {
            ticket.resolvedAt =
                undefined;
        }
        if (previous !==
            status) {
            await (0, supportActivityService_js_1.recordSupportActivity)({
                ticketId,
                eventType: previous ===
                    "Resolved"
                    ? "REOPENED"
                    : "STATUS_CHANGED",
                summary: `Status changed from ${previous} to ${status}.`,
                actorAdminId: adminId,
                actorName: adminName,
            });
        }
    }
    if (priority !==
        undefined) {
        if (!VALID_PRIORITY.includes(priority)) {
            throw new Error("INVALID_PRIORITY");
        }
        const previous = ticket.priority;
        ticket.priority =
            priority;
        if (previous !==
            priority) {
            ticket.slaDueAt =
                (0, supportSlaService_js_1.calculateSupportSlaDueAt)(priority);
            await (0, supportActivityService_js_1.recordSupportActivity)({
                ticketId,
                eventType: "PRIORITY_CHANGED",
                summary: `Priority changed from ${previous} to ${priority}.`,
                actorAdminId: adminId,
                actorName: adminName,
            });
        }
    }
    if (category !==
        undefined) {
        if (!VALID_CATEGORY.includes(category)) {
            throw new Error("INVALID_CATEGORY");
        }
        const previous = ticket.category;
        ticket.category =
            category;
        if (previous !==
            category) {
            await (0, supportActivityService_js_1.recordSupportActivity)({
                ticketId,
                eventType: "CATEGORY_CHANGED",
                summary: `Category changed from ${previous} to ${category}.`,
                actorAdminId: adminId,
                actorName: adminName,
            });
        }
    }
    if (assigneeAdminId !==
        undefined) {
        if (assigneeAdminId ===
            null ||
            assigneeAdminId ===
                "") {
            ticket.assigneeAdminId =
                undefined;
        }
        else {
            const assignee = await User_js_1.User.findOne({
                _id: assigneeAdminId,
                role: "admin",
                accountStatus: "active",
            })
                .select("_id")
                .lean();
            if (!assignee) {
                throw new Error("INVALID_ASSIGNEE");
            }
            ticket.assigneeAdminId =
                assignee._id;
        }
        await (0, supportActivityService_js_1.recordSupportActivity)({
            ticketId,
            eventType: "ASSIGNEE_CHANGED",
            summary: assigneeAdminId
                ? "Ticket owner updated."
                : "Ticket returned to the unassigned queue.",
            actorAdminId: adminId,
            actorName: adminName,
        });
    }
    if (tags !==
        undefined) {
        ticket.tags =
            normalizeTags(tags);
    }
    ticket.lastActivityAt =
        new Date();
    await ticket.save();
    return ticket;
};
exports.updateSupportTicket = updateSupportTicket;
const addAdminSupportMessage = async ({ ticketId, adminId, body, visibility, }) => {
    const cleanBody = body
        .trim()
        .slice(0, 4000);
    if (!cleanBody) {
        throw new Error("EMPTY_MESSAGE");
    }
    const ticket = await SupportTicket_js_1.SupportTicket.findById(ticketId);
    if (!ticket) {
        return null;
    }
    const adminName = await getAdminName(adminId);
    await SupportMessage_js_1.SupportMessage.create({
        ticketId: ticket._id,
        visibility,
        authorType: "admin",
        authorAdminId: adminId,
        bodyEncrypted: (0, crypto_js_1.encryptData)(cleanBody),
    });
    if (visibility ===
        "public") {
        ticket.waitingOn =
            "customer";
        if (!ticket.firstResponseAt) {
            ticket.firstResponseAt =
                new Date();
        }
        if (ticket.status ===
            "Open") {
            ticket.status =
                "In Progress";
        }
    }
    ticket.lastActivityAt =
        new Date();
    await ticket.save();
    await (0, supportActivityService_js_1.recordSupportActivity)({
        ticketId,
        eventType: visibility ===
            "public"
            ? "ADMIN_REPLY"
            : "INTERNAL_NOTE",
        summary: visibility ===
            "public"
            ? "Administrator replied to the customer."
            : "Internal support note added.",
        actorAdminId: adminId,
        actorName: adminName,
    });
    return ticket;
};
exports.addAdminSupportMessage = addAdminSupportMessage;
const escalateSupportTicket = async ({ ticketId, adminId, reason, }) => {
    const ticket = await SupportTicket_js_1.SupportTicket.findById(ticketId);
    if (!ticket) {
        return null;
    }
    const adminName = await getAdminName(adminId);
    ticket.status =
        "Escalated";
    ticket.waitingOn =
        "admin";
    ticket.lastActivityAt =
        new Date();
    await ticket.save();
    await (0, supportActivityService_js_1.recordSupportActivity)({
        ticketId,
        eventType: "ESCALATED",
        summary: `Ticket escalated: ${reason
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 160)}`,
        actorAdminId: adminId,
        actorName: adminName,
    });
    return ticket;
};
exports.escalateSupportTicket = escalateSupportTicket;
const resolveSupportTicket = async ({ ticketId, adminId, resolution, }) => {
    const clean = resolution
        .trim()
        .slice(0, 2000);
    if (!clean) {
        throw new Error("EMPTY_RESOLUTION");
    }
    const ticket = await SupportTicket_js_1.SupportTicket.findById(ticketId);
    if (!ticket) {
        return null;
    }
    const adminName = await getAdminName(adminId);
    ticket.status =
        "Resolved";
    ticket.waitingOn =
        "none";
    ticket.resolvedAt =
        new Date();
    ticket.resolutionEncrypted =
        (0, crypto_js_1.encryptData)(clean);
    ticket.lastActivityAt =
        new Date();
    await ticket.save();
    await (0, supportActivityService_js_1.recordSupportActivity)({
        ticketId,
        eventType: "RESOLVED",
        summary: "Ticket resolved by support.",
        actorAdminId: adminId,
        actorName: adminName,
    });
    return ticket;
};
exports.resolveSupportTicket = resolveSupportTicket;
