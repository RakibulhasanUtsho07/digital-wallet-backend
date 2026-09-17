import {
  SupportTicket,
} from "../models/SupportTicket.js";

import {
  User,
} from "../models/User.js";

import {
  getSupportSlaRemainingMinutes,
} from "./supportSlaService.js";

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
    return decryptData(
      value
    );
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
   SLA STATUS
========================================================= */

const getSlaStatus = (
  slaMinutes: number,
  resolved: boolean
):
  | "Healthy"
  | "Due Soon"
  | "Breached"
  | "Resolved" => {
  if (resolved) {
    return "Resolved";
  }

  if (slaMinutes <= 0) {
    return "Breached";
  }

  if (slaMinutes <= 15) {
    return "Due Soon";
  }

  return "Healthy";
};

/* =========================================================
   SLA MONITORING
========================================================= */

export const getSupportSlaMonitoring =
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
      Record<string, unknown> = {};

    /* =====================================================
       TICKET STATUS FILTER
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
       PRIORITY FILTER
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
            slaDueAt:
              1,
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

    if (!tickets.length) {
      return {
        tickets: [],
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
       LOAD CUSTOMER / ASSIGNEE
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

    const assigneeIds =
      Array.from(
        new Set(
          tickets
            .map(
              (
                ticket
              ) =>
                ticket.assigneeAdminId?.toString()
            )
            .filter(
              Boolean
            )
        )
      );

    const [
      customers,
      assignees,
    ] =
      await Promise.all([
        User.find({
          _id: {
            $in:
              customerIds,
          },
        })
          .select(
            "name emailEncrypted"
          )
          .lean(),

        assigneeIds.length
          ? User.find({
              _id: {
                $in:
                  assigneeIds,
              },

              accountStatus:
                "active",
            })
              .select(
                "name role"
              )
              .lean()
          : [],
      ]);

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

    const assigneeMap =
      new Map(
        assignees.map(
          (
            assignee
          ) => [
            assignee._id.toString(),
            assignee,
          ]
        )
      );

    /* =====================================================
       RESPONSE
    ====================================================== */

    const now =
      new Date();

    return {
      tickets:
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

            const assignee =
              ticket.assigneeAdminId
                ? assigneeMap.get(
                    ticket.assigneeAdminId.toString()
                  )
                : null;

            const slaMinutes =
              getSupportSlaRemainingMinutes(
                new Date(
                  ticket.slaDueAt
                )
              );

            const resolved =
              ticket.status ===
              "Resolved";

            const slaStatus =
              getSlaStatus(
                slaMinutes,
                resolved
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
              },

              assignee:
                assignee
                  ? {
                      id:
                        assignee._id.toString(),

                      name:
                        assignee.name,

                      role:
                        assignee.role,
                    }
                  : null,

              sla: {
                status:
                  slaStatus,

                minutesRemaining:
                  Math.max(
                    slaMinutes,
                    0
                  ),

                minutesOverdue:
                  Math.max(
                    0,
                    -slaMinutes
                  ),

                dueAt:
                  new Date(
                    ticket.slaDueAt
                  ).toISOString(),

                breached:
                  !resolved &&
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

              monitoredAt:
                now.toISOString(),
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

/* =========================================================
   SLA SUMMARY
========================================================= */

export const getSupportSlaSummary =
  async () => {
    const now =
      new Date();

    const dueSoon =
      new Date(
        now.getTime() +
          15 *
            60 *
            1000
      );

    const [
      active,
      healthy,
      dueSoonCount,
      breached,
      resolved,
    ] =
      await Promise.all([
        SupportTicket.countDocuments({
          status: {
            $ne:
              "Resolved",
          },
        }),

        SupportTicket.countDocuments({
          status: {
            $ne:
              "Resolved",
          },

          slaDueAt: {
            $gt:
              dueSoon,
          },
        }),

        SupportTicket.countDocuments({
          status: {
            $ne:
              "Resolved",
          },

          slaDueAt: {
            $gt:
              now,

            $lte:
              dueSoon,
          },
        }),

        SupportTicket.countDocuments({
          status: {
            $ne:
              "Resolved",
          },

          slaDueAt: {
            $lte:
              now,
          },
        }),

        SupportTicket.countDocuments({
          status:
            "Resolved",
        }),
      ]);

    return {
      active,
      healthy,
      dueSoon:
        dueSoonCount,
      breached,
      resolved,
    };
  };