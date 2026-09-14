import {
  SupportActivity,
} from "../models/SupportActivity.js";

import {
  SupportTicket,
} from "../models/SupportTicket.js";

import {
  User,
} from "../models/User.js";

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
   SUPPORT ACTIVITY LOG
========================================================= */

export const getSupportActivityLog =
  async ({
    search,
    eventType,
    page = 1,
    limit = 30,
  }: {
    search?: string;
    eventType?: string;
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
        100,
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
       EVENT FILTER
    ====================================================== */

    const validEventTypes = [
      "TICKET_CREATED",
      "STATUS_CHANGED",
      "PRIORITY_CHANGED",
      "CATEGORY_CHANGED",
      "ASSIGNEE_CHANGED",
      "CUSTOMER_REPLY",
      "ADMIN_REPLY",
      "INTERNAL_NOTE",
      "ESCALATED",
      "RESOLVED",
      "REOPENED",
    ];

    if (
      eventType &&
      validEventTypes.includes(
        eventType
      )
    ) {
      query.eventType =
        eventType;
    }

    /* =====================================================
       SEARCH SUMMARY / ACTOR
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
          summary: {
            $regex:
              escapeRegex(
                cleanSearch
              ),
            $options:
              "i",
          },
        },
        {
          actorName: {
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
      activities,
      total,
    ] =
      await Promise.all([
        SupportActivity.find(
          query
        )
          .sort({
            createdAt:
              -1,
          })
          .skip(
            skip
          )
          .limit(
            safeLimit
          )
          .lean(),

        SupportActivity.countDocuments(
          query
        ),
      ]);

    if (!activities.length) {
      return {
        activities: [],
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
       LOAD TICKETS
    ====================================================== */

    const ticketIds =
      Array.from(
        new Set(
          activities.map(
            (
              activity
            ) =>
              activity.ticketId.toString()
          )
        )
      );

    const tickets =
      await SupportTicket.find({
        _id: {
          $in:
            ticketIds,
        },
      })
        .select(
          "_id ticketNumber subject"
        )
        .lean();

    const ticketMap =
      new Map(
        tickets.map(
          (
            ticket
          ) => [
            ticket._id.toString(),
            ticket,
          ]
        )
      );

    /* =====================================================
       LOAD ACTORS
    ====================================================== */

    const actorIds =
      Array.from(
        new Set(
          activities
            .flatMap(
              (
                activity
              ) => [
                activity.actorAdminId?.toString(),
                activity.actorUserId?.toString(),
              ]
            )
            .filter(
              Boolean
            )
        )
      );

    const actors =
      actorIds.length
        ? await User.find({
            _id: {
              $in:
                actorIds,
            },
          })
            .select(
              "name role accountStatus"
            )
            .lean()
        : [];

    const actorMap =
      new Map(
        actors.map(
          (
            actor
          ) => [
            actor._id.toString(),
            actor,
          ]
        )
      );

    /* =====================================================
       RESPONSE
    ====================================================== */

    return {
      activities:
        activities.map(
          (
            activity
          ) => {
            const ticket =
              ticketMap.get(
                activity.ticketId.toString()
              );

            const actorId =
              activity.actorAdminId?.toString() ??
              activity.actorUserId?.toString();

            const actor =
              actorId
                ? actorMap.get(
                    actorId
                  )
                : null;

            return {
              id:
                activity._id.toString(),

              eventType:
                activity.eventType,

              summary:
                activity.summary,

              actor: {
                id:
                  actorId ??
                  null,

                name:
                  activity.actorName,

                role:
                  actor?.role ??
                  null,

                accountStatus:
                  actor?.accountStatus ??
                  null,
              },

              ticket: {
                id:
                  ticket?._id
                    ? ticket._id.toString()
                    : activity.ticketId.toString(),

                ticketNumber:
                  ticket?.ticketNumber ??
                  null,

                subject:
                  ticket?.subject ??
                  null,
              },

              createdAt:
                new Date(
                  activity.createdAt
                ).toISOString(),

              updatedAt:
                new Date(
                  activity.updatedAt
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