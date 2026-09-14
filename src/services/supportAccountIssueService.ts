import {
  SupportTicket,
} from "../models/SupportTicket.js";

import {
  User,
} from "../models/User.js";

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
   LIST ACCOUNT ISSUES
---------------------------------------------------------
Support tickets categorized as "Account".
========================================================= */

export const listSupportAccountIssues =
  async ({
    search,
    status,
    priority,
    page = 1,
    limit = 20,
  }: {
    search?: string;
    status?: string;
    priority?: string;
    page?: number;
    limit?: number;
  }) => {
    const safePage =
      Math.max(
        1,
        Math.floor(page)
      );

    const safeLimit =
      Math.min(
        50,
        Math.max(
          1,
          Math.floor(limit)
        )
      );

    const skip =
      (safePage - 1) *
      safeLimit;

    const query:
      Record<string, unknown> = {
      category:
        "Account",
    };

    /* =====================================================
       STATUS
    ====================================================== */

    if (
      status &&
      [
        "Open",
        "Waiting for Customer",
        "In Progress",
        "Escalated",
        "Resolved",
      ].includes(status)
    ) {
      query.status =
        status;
    }

    /* =====================================================
       PRIORITY
    ====================================================== */

    if (
      priority &&
      [
        "Low",
        "Normal",
        "High",
        "Urgent",
      ].includes(priority)
    ) {
      query.priority =
        priority;
    }

    /* =====================================================
       SEARCH
    ====================================================== */

    const cleanSearch =
      search
        ?.trim()
        .slice(
          0,
          120
        );

    if (
      cleanSearch
    ) {
      query.$or = [
        {
          ticketNumber: {
            $regex:
              escapeRegex(
                cleanSearch
              ),
            $options:
              "i",
          },
        },

        {
          subject: {
            $regex:
              escapeRegex(
                cleanSearch
              ),
            $options:
              "i",
          },
        },

        {
          relatedReference: {
            $regex:
              escapeRegex(
                cleanSearch
              ),
            $options:
              "i",
          },
        },
      ];
    }

    const [
      tickets,
      total,
    ] =
      await Promise.all([
        SupportTicket.find(
          query
        )
          .sort({
            lastActivityAt:
              -1,
          })
          .skip(
            skip
          )
          .limit(
            safeLimit
          )
          .lean(),

        SupportTicket.countDocuments(
          query
        ),
      ]);

    if (
      !tickets.length
    ) {
      return {
        issues: [],
        total,
        page:
          safePage,
        limit:
          safeLimit,
        totalPages:
          Math.ceil(
            total /
              safeLimit
          ),
      };
    }

    /* =====================================================
       CUSTOMER IDS
    ====================================================== */

    const customerIds =
      Array.from(
        new Set(
          tickets.map(
            (
              ticket
            ) =>
              ticket.customerUserId.toString()
          )
        )
      );

    /* =====================================================
       LOAD CUSTOMERS
    ====================================================== */

    const customers =
      await User.find({
        _id: {
          $in:
            customerIds,
        },
      })
        .select(
          "name emailEncrypted phoneEncrypted role kycStatus emailVerified walletId"
        )
        .lean();

    const customerMap =
      new Map(
        customers.map(
          (
            customer
          ) => [
            customer._id.toString(),
            customer,
          ]
        )
      );

    /* =====================================================
       RESPONSE
    ====================================================== */

    return {
      issues:
        tickets.map(
          (
            ticket
          ) => {
            const customer =
              customerMap.get(
                ticket.customerUserId.toString()
              ) as
                | any
                | undefined;

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

                role:
                  customer?.role ??
                  null,

                kycStatus:
                  customer?.kycStatus ??
                  "not_started",

                emailVerified:
                  Boolean(
                    customer?.emailVerified
                  ),

                walletLinked:
                  Boolean(
                    customer?.walletId
                  ),
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
          }
        ),

      total,

      page:
        safePage,

      limit:
        safeLimit,

      totalPages:
        Math.ceil(
          total /
            safeLimit
        ),
    };
  };