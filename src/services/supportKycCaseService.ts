import {
  SupportTicket,
} from "../models/SupportTicket.js";

import {
  User,
} from "../models/User.js";
import { currentEKYCStatuses } from "./identityVerificationService.js";

import {
  decryptData,
} from "../utils/crypto.js";

/* =========================================================
   SAFE DECRYPT
========================================================= */

const safeDecrypt = (
  value:
    | {
        encrypted: string;
        iv: string;
        authTag: string;
      }
    | undefined
): string => {
  if (!value) {
    return "";
  }

  try {
    return decryptData(value);
  } catch {
    return "";
  }
};

/* =========================================================
   ESCAPE REGEX
========================================================= */

const escapeRegex = (
  value: string
): string =>
  value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

/* =========================================================
   LIST KYC CASES
---------------------------------------------------------
Support tickets categorized as KYC.
========================================================= */

export const listSupportKycCases = async ({
  search, status, priority, kycStatus, page = 1, limit = 20,
}: {
  search?: string;
  status?: string;
  priority?: string;
  kycStatus?: string;
  page?: number;
  limit?: number;
}) => {
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)));
  const query: Record<string, unknown> = { category: "KYC" };
  if (status && ["Open", "Waiting for Customer", "In Progress", "Escalated", "Resolved"].includes(status)) {
    query.status = status;
  }
  if (priority && ["Low", "Normal", "High", "Urgent"].includes(priority)) {
    query.priority = priority;
  }
  const cleanSearch = search?.trim().slice(0, 120);
  if (cleanSearch) {
    const expression = { $regex: escapeRegex(cleanSearch), $options: "i" };
    query.$or = [
      { ticketNumber: expression },
      { subject: expression },
      { relatedReference: expression },
    ];
  }

  // Filter by current e-KYC before pagination so total and page counts remain correct.
  if (kycStatus && ["not_started", "pending", "under_review", "verified", "rejected"].includes(kycStatus)) {
    const ids = await SupportTicket.distinct("customerUserId", query);
    const statuses = await currentEKYCStatuses(ids);
    query.customerUserId = { $in: ids.filter((id) =>
      (statuses.get(String(id)) ?? "not_started") === kycStatus
    ) };
  }

  const [tickets, total] = await Promise.all([
    SupportTicket.find(query).sort({ lastActivityAt: -1 })
      .skip((safePage - 1) * safeLimit).limit(safeLimit).lean(),
    SupportTicket.countDocuments(query),
  ]);
  const customerIds = [...new Set(tickets.map((ticket) => ticket.customerUserId.toString()))];
  const [customers, statuses] = await Promise.all([
    User.find({ _id: { $in: customerIds } })
      .select("name emailEncrypted phoneEncrypted role walletId emailVerified emailVerifiedAt").lean(),
    currentEKYCStatuses(customerIds),
  ]);
  const customerMap = new Map(customers.map((customer) => [customer._id.toString(), customer]));
  return {
    cases: tickets.map((ticket) => {
      const id = ticket.customerUserId.toString();
      const customer = customerMap.get(id);
      return mapKycCase(ticket, customer
        ? { ...customer, kycStatus: statuses.get(id) ?? "not_started" }
        : { kycStatus: statuses.get(id) ?? "not_started" });
    }),
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit),
  };
};

/* =========================================================
   MAP KYC CASE
========================================================= */

const mapKycCase = (
  ticket: any,
  customer: any
) => {
  const slaDueAt =
    new Date(
      ticket.slaDueAt
    );

  const slaMinutes =
    Math.floor(
      (
        slaDueAt.getTime() -
        Date.now()
      ) /
        60000
    );

  return {
    id:
      ticket._id.toString(),

    ticketNumber:
      ticket.ticketNumber,

    subject:
      ticket.subject,

    category:
      ticket.category,

    priority:
      ticket.priority,

    status:
      ticket.status,

    waitingOn:
      ticket.waitingOn,

    relatedReference:
      ticket.relatedReference ??
      null,

    customer: {
      id:
        ticket.customerUserId.toString(),

      name:
        customer?.name ??
        "Unknown customer",

      email:
        safeDecrypt(
          customer?.emailEncrypted
        ),

      phone:
        safeDecrypt(
          customer?.phoneEncrypted
        ),

      kycStatus:
        customer?.kycStatus ??
        "not_started",

      emailVerified:
        Boolean(
          customer?.emailVerified
        ),

      emailVerifiedAt:
        customer?.emailVerifiedAt
          ? new Date(
              customer.emailVerifiedAt
            ).toISOString()
          : null,

      walletLinked:
        Boolean(
          customer?.walletId
        ),

      role:
        customer?.role ??
        null,
    },

    sla: {
      dueAt:
        slaDueAt.toISOString(),

      minutesRemaining:
        slaMinutes,

      breached:
        ticket.status !==
          "Resolved" &&
        slaMinutes <=
          0,
    },

    lastActivityAt:
      new Date(
        ticket.lastActivityAt
      ).toISOString(),

    createdAt:
      new Date(
        ticket.createdAt
      ).toISOString(),
  };
};