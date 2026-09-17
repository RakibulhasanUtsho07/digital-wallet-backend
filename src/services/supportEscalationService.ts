import {
  SupportTicket,
} from "../models/SupportTicket.js";

import {
  SupportActivity,
} from "../models/SupportActivity.js";

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
    return decryptData(
      value
    );
  } catch {
    return "";
  }
};

/* =========================================================
   SAFE REGEX
========================================================= */

const escapeRegex = (
  value: string
): string => {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
};

/* =========================================================
   LIST ESCALATED TICKETS
========================================================= */

export const listSupportEscalations =
  async ({
    search,
    priority,
    page = 1,
    limit = 20,
  }: {
    search?: string;
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
      status:
        "Escalated",
    };

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

    if (!tickets.length) {
      return {
        escalations: [],
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
       LOAD CUSTOMERS + ASSIGNEES
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
       ESCALATION ACTIVITIES
    ====================================================== */

    const ticketIds =
      tickets.map(
        (
          ticket
        ) =>
          ticket._id
      );

    const escalationActivities =
      await SupportActivity.find({
        ticketId: {
          $in:
            ticketIds,
        },
        eventType:
          "ESCALATED",
      })
        .sort({
          createdAt:
            -1,
        })
        .lean();

    const escalationMap =
      new Map<
        string,
        any
      >();

    for (
      const activity of escalationActivities
    ) {
      const ticketId =
        activity.ticketId.toString();

      /*
       * First one is the newest because of descending sort.
       */
      if (
        !escalationMap.has(
          ticketId
        )
      ) {
        escalationMap.set(
          ticketId,
          activity
        );
      }
    }

    /* =====================================================
       RESPONSE
    ====================================================== */

    return {
      escalations:
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

            const escalation =
              escalationMap.get(
                ticket._id.toString()
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

              escalation:
                escalation
                  ? {
                      id:
                        escalation._id.toString(),

                      summary:
                        escalation.summary,

                      actorName:
                        escalation.actorName,

                      createdAt:
                        new Date(
                          escalation.createdAt
                        ).toISOString(),
                    }
                  : null,

              relatedReference:
                ticket.relatedReference ??
                null,

              lastActivityAt:
                new Date(
                  ticket.lastActivityAt
                ).toISOString(),

              createdAt:
                new Date(
                  ticket.createdAt
                ).toISOString(),

              slaDueAt:
                new Date(
                  ticket.slaDueAt
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

/* =========================================================
   GET ESCALATION DETAIL
========================================================= */

export const getSupportEscalationDetail =
  async (
    ticketId: string
  ) => {
    const ticket =
      await SupportTicket.findOne({
        _id:
          ticketId,

        status:
          "Escalated",
      }).lean();

    if (
      !ticket
    ) {
      return null;
    }

    const [
      customer,
      assignee,
      activities,
    ] =
      await Promise.all([
        User.findById(
          ticket.customerUserId
        )
          .select(
            "name emailEncrypted kycStatus walletId"
          )
          .lean(),

        ticket.assigneeAdminId
          ? User.findById(
              ticket.assigneeAdminId
            )
              .select(
                "name role"
              )
              .lean()
          : null,

        SupportActivity.find({
          ticketId:
            ticket._id,
          eventType:
            "ESCALATED",
        })
          .sort({
            createdAt:
              -1,
          })
          .limit(
            20
          )
          .lean(),
      ]);

    if (
      !customer
    ) {
      return null;
    }

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
          customer._id.toString(),

        name:
          customer.name,

        email:
          safeDecrypt(
            customer.emailEncrypted
          ),

        kycStatus:
          customer.kycStatus,

        walletLinked:
          Boolean(
            customer.walletId
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

      relatedReference:
        ticket.relatedReference ??
        null,

      slaDueAt:
        new Date(
          ticket.slaDueAt
        ).toISOString(),

      escalationHistory:
        activities.map(
          (
            activity
          ) => ({
            id:
              activity._id.toString(),

            summary:
              activity.summary,

            actorName:
              activity.actorName,

            createdAt:
              new Date(
                activity.createdAt
              ).toISOString(),
          })
        ),

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