import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { z } from "zod";

import { PublicSupportTicket } from "../models/PublicSupportTicket.js";
import { encryptData } from "../utils/crypto.js";

const supportTicketSchema = z
  .object({
    category: z.enum([
      "transfer",
      "wallet",
      "account",
      "verification",
      "other",
    ]),
    message: z
      .string()
      .trim()
      .min(10, "Please describe the problem in at least 10 characters.")
      .max(600, "The support message cannot exceed 600 characters."),
    email: z
      .union([
        z.string().trim().email("Enter a valid email address.").max(254),
        z.literal(""),
      ])
      .optional(),
    website: z.string().trim().max(200).optional(),
  })
  .strict();

function createTicketNumber(): string {
  const date = new Date();
  const datePart = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("");

  const randomPart = randomBytes(4).toString("hex").toUpperCase();

  return `COF-${datePart}-${randomPart}`;
}

function getSafeUserAgent(req: Request): string | undefined {
  const userAgent = req.get("user-agent")?.trim();
  return userAgent ? userAgent.slice(0, 220) : undefined;
}

// @desc    Create a public support ticket
// @route   POST /api/support/tickets
// @access  Public (rate limited)
export const createSupportTicket = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    res.setHeader("Cache-Control", "no-store");

    const parsed = supportTicketSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message:
          parsed.error.issues[0]?.message || "Invalid support request.",
      });
      return;
    }

    const { category, message, email, website } = parsed.data;

    /*
     * Honeypot field. Human users never see or fill this input.
     * Return a generic success response so automated spam clients
     * cannot use the response to tune their submission.
     */
    if (website) {
      res.status(201).json({
        success: true,
        message: "Support request received.",
        ticket: {
          ticketNumber: "COF-RECEIVED",
          status: "open",
          createdAt: new Date().toISOString(),
        },
      });
      return;
    }

    const ticket = await PublicSupportTicket.create({
      ticketNumber: createTicketNumber(),
      category,
      messageEncrypted: encryptData(message),
      contactEmailEncrypted: email ? encryptData(email.toLowerCase()) : undefined,
      status: "open",
      priority: "normal",
      source: "landing_page",
      userAgent: getSafeUserAgent(req),
    });

    res.status(201).json({
      success: true,
      message: "Your support request has been created.",
      ticket: {
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        createdAt: ticket.createdAt,
      },
    });
  } catch (error: unknown) {
    console.error(
      "CREATE SUPPORT TICKET ERROR:",
      error instanceof Error ? error.message : error
    );

    res.status(500).json({
      success: false,
      message: "Unable to create the support request. Please try again.",
    });
  }
};
