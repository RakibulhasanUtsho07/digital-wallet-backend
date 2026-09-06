import { randomBytes } from "node:crypto";

import { SupportActivity } from "../models/SupportActivity.js";
import { SupportMessage } from "../models/SupportMessage.js";
import {
  SupportTicket,
  type ISupportTicket,
} from "../models/SupportTicket.js";
import { User } from "../models/User.js";
import type { SupportTicketCategory } from "../types/support.js";
import {
  createLookupHash,
  encryptData,
  normalizeEmail,
} from "../utils/crypto.js";
import { createNotification } from "./notificationService.js";
import { recordSupportActivity } from "./supportActivityService.js";
import { calculateSupportSlaDueAt } from "./supportSlaService.js";

export type PublicSupportCategory =
  | "transfer"
  | "wallet"
  | "account"
  | "verification"
  | "other";

const CATEGORY_MAP: Record<PublicSupportCategory, SupportTicketCategory> = {
  transfer: "Transfer",
  wallet: "Payment",
  account: "Account",
  verification: "KYC",
  other: "Other",
};

const SUBJECT_MAP: Record<PublicSupportCategory, string> = {
  transfer: "Transfer issue reported from landing page",
  wallet: "Wallet or balance issue reported from landing page",
  account: "Account access issue reported from landing page",
  verification: "Identity verification issue reported from landing page",
  other: "Support request submitted from landing page",
};

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

async function findActiveCustomer(accountEmail: string) {
  const normalizedEmail = normalizeEmail(accountEmail);

  if (!normalizedEmail) {
    return null;
  }

  return User.findOne({
    emailLookup: createLookupHash(normalizedEmail),
    accountStatus: "active",
  })
    .select("_id name")
    .lean();
}

export async function createPublicSupportTicket({
  category,
  message,
  accountEmail,
}: {
  category: PublicSupportCategory;
  message: string;
  accountEmail: string;
}) {
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

  const priority = "Normal" as const;
  const now = new Date();
  let ticket: ISupportTicket | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      ticket = await SupportTicket.create({
        ticketNumber: createTicketNumber(),
        customerUserId: customer._id,
        subject: SUBJECT_MAP[category],
        descriptionEncrypted: encryptData(cleanMessage),
        category: CATEGORY_MAP[category],
        priority,
        status: "Open",
        waitingOn: "admin",
        tags: ["landing-page"],
        source: "landing_page",
        slaDueAt: calculateSupportSlaDueAt(priority, now),
        lastActivityAt: now,
        createdByUserId: customer._id,
      });
      break;
    } catch (error: unknown) {
      const mongoError = error as { code?: number };

      if (mongoError.code !== 11000 || attempt === 2) {
        throw error;
      }
    }
  }

  if (!ticket) {
    throw new Error("TICKET_CREATE_FAILED");
  }

  try {
    await SupportMessage.create({
      ticketId: ticket._id,
      visibility: "public",
      authorType: "customer",
      authorUserId: customer._id,
      bodyEncrypted: encryptData(cleanMessage),
    });

    await recordSupportActivity({
      ticketId: ticket._id.toString(),
      eventType: "TICKET_CREATED",
      summary: `Ticket ${ticket.ticketNumber} created from the landing page.`,
      actorUserId: customer._id.toString(),
      actorName: customer.name || "Customer",
    });
  } catch (error) {
    await Promise.allSettled([
      SupportMessage.deleteMany({ ticketId: ticket._id }),
      SupportActivity.deleteMany({ ticketId: ticket._id }),
      SupportTicket.deleteOne({ _id: ticket._id }),
    ]);
    throw error;
  }

  try {
    await createNotification({
      userId: customer._id,
      type: "SYSTEM",
      priority: "NORMAL",
      title: "Support ticket received",
      message: `${ticket.ticketNumber} has been added to the support queue.`,
      relatedEntityType: "SupportTicket",
      relatedEntityId: ticket._id,
      createdBy: "SYSTEM",
    });
  } catch (notificationError) {
    console.error("SUPPORT TICKET NOTIFICATION ERROR:", notificationError);
  }

  return {
    id: ticket._id.toString(),
    ticketNumber: ticket.ticketNumber,
    status: ticket.status,
    createdAt: ticket.createdAt.toISOString(),
  };
}
