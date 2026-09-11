"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSupportTicket = createSupportTicket;
const zod_1 = require("zod");
const publicSupportTicketService_js_1 = require("../services/publicSupportTicketService.js");
const supportTicketSchema = zod_1.z
    .object({
    category: zod_1.z.enum([
        "transfer",
        "wallet",
        "account",
        "verification",
        "other",
    ]),
    message: zod_1.z
        .string()
        .trim()
        .min(10, "Please describe the problem in at least 10 characters.")
        .max(600, "The support message cannot exceed 600 characters."),
    email: zod_1.z
        .string()
        .trim()
        .email("Enter the email address connected to your Coffer account.")
        .max(254),
    website: zod_1.z.string().trim().max(200).optional(),
})
    .strict();
function mapServiceError(error) {
    const code = error instanceof Error ? error.message : "";
    const errors = {
        CUSTOMER_NOT_FOUND: {
            status: 404,
            message: "No active Coffer account was found for that email address.",
        },
        INVALID_CATEGORY: {
            status: 400,
            message: "Choose a valid support category.",
        },
        INVALID_MESSAGE: {
            status: 400,
            message: "Please describe the problem in at least 10 characters.",
        },
        TICKET_CREATE_FAILED: {
            status: 503,
            message: "Support is temporarily unavailable. Please try again.",
        },
    };
    return (errors[code] || {
        status: 500,
        message: "Unable to create the support request. Please try again.",
    });
}
// @desc    Create a support ticket from the public landing-page chat
// @route   POST /api/support/tickets
// @access  Public, rate limited; requires an existing account email
async function createSupportTicket(req, res) {
    res.setHeader("Cache-Control", "no-store");
    const parsed = supportTicketSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            success: false,
            message: parsed.error.issues[0]?.message || "Invalid support request.",
        });
        return;
    }
    const { category, message, email, website } = parsed.data;
    // Honeypot: real users never see or fill this field.
    if (website) {
        res.status(201).json({
            success: true,
            message: "Support request received.",
            ticket: {
                ticketNumber: "COF-RECEIVED",
                status: "Open",
                createdAt: new Date().toISOString(),
            },
        });
        return;
    }
    try {
        const ticket = await (0, publicSupportTicketService_js_1.createPublicSupportTicket)({
            category,
            message,
            accountEmail: email,
        });
        res.status(201).json({
            success: true,
            message: "Your support request has been created.",
            ticket,
        });
    }
    catch (error) {
        const mapped = mapServiceError(error);
        if (mapped.status === 500) {
            console.error("CREATE PUBLIC SUPPORT TICKET ERROR:", error instanceof Error ? error.message : error);
        }
        res.status(mapped.status).json({
            success: false,
            message: mapped.message,
        });
    }
}
