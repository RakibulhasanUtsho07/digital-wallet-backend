import {
  SupportTicket,
} from "../models/SupportTicket.js";

export const getSupportOverview =
  async () => {
    const now =
      new Date();

    const startOfToday =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );

    const dueSoon =
      new Date(
        now.getTime() +
          15 *
            60 *
            1000
      );

    const [
      openTickets,
      pendingReplies,
      slaRisk,
      breached,
      resolvedToday,
      unassigned,
      escalated,
      priorityWaiting,
      csatRows,
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
          waitingOn:
            "admin",
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
          resolvedAt: {
            $gte:
              startOfToday,
          },
        }),

        SupportTicket.countDocuments({
          status: {
            $ne:
              "Resolved",
          },
          assigneeAdminId: {
            $exists:
              false,
          },
        }),

        SupportTicket.countDocuments({
          status:
            "Escalated",
        }),

        SupportTicket.countDocuments({
          status: {
            $ne:
              "Resolved",
          },
          waitingOn:
            "admin",
          priority: {
            $in: [
              "Urgent",
              "High",
            ],
          },
        }),

        SupportTicket.aggregate<{
          _id:
            null;
          average:
            number;
        }>([
          {
            $match: {
              csatScore: {
                $exists:
                  true,
              },
            },
          },
          {
            $group: {
              _id:
                null,
              average: {
                $avg:
                  "$csatScore",
              },
            },
          },
        ]),
      ]);

    const csat =
      csatRows[0]
        ?.average;

    return {
      metrics: {
        openTickets,
        pendingReplies,
        slaRisk,
        breached,
        resolvedToday,
        csat:
          typeof csat ===
          "number"
            ? Number(
                csat.toFixed(
                  1
                )
              )
            : null,
        unassigned,
        escalated,
      },

      attention: {
        slaDueSoon:
          slaRisk,
        priorityWaiting,
        escalated,
        unassigned,
      },
    };
  };
