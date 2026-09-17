import {
  SupportTicket,
} from "../models/SupportTicket.js";

import {
  SupportActivity,
} from "../models/SupportActivity.js";

/* =========================================================
   HELPERS
========================================================= */

const getStartDate = (
  days: number
): Date => {
  const safeDays =
    Math.min(
      90,
      Math.max(
        1,
        Math.floor(days)
      )
    );

  const date =
    new Date();

  date.setHours(
    0,
    0,
    0,
    0
  );

  date.setDate(
    date.getDate() -
      (safeDays - 1)
  );

  return date;
};

/* =========================================================
   SUPPORT ANALYTICS
========================================================= */

export const getSupportDashboardAnalytics =
  async ({
    days = 30,
  }: {
    days?: number;
  }) => {
    const safeDays =
      Math.min(
        90,
        Math.max(
          1,
          Math.floor(days)
        )
      );

    const startDate =
      getStartDate(
        safeDays
      );

    const now =
      new Date();

    /* =====================================================
       HIGH LEVEL COUNTS
    ====================================================== */

    const [
      totalTickets,
      resolvedTickets,
      openTickets,
      escalatedTickets,
      breachedTickets,
      waitingCustomerTickets,
      urgentTickets,
    ] =
      await Promise.all([
        SupportTicket.countDocuments({
          createdAt: {
            $gte:
              startDate,
          },
        }),

        SupportTicket.countDocuments({
          createdAt: {
            $gte:
              startDate,
          },

          status:
            "Resolved",
        }),

        SupportTicket.countDocuments({
          createdAt: {
            $gte:
              startDate,
          },

          status: {
            $ne:
              "Resolved",
          },
        }),

        SupportTicket.countDocuments({
          createdAt: {
            $gte:
              startDate,
          },

          status:
            "Escalated",
        }),

        SupportTicket.countDocuments({
          createdAt: {
            $gte:
              startDate,
          },

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
          createdAt: {
            $gte:
              startDate,
          },

          status: {
            $ne:
              "Resolved",
          },

          waitingOn:
            "customer",
        }),

        SupportTicket.countDocuments({
          createdAt: {
            $gte:
              startDate,
          },

          priority:
            "Urgent",
        }),
      ]);

    /* =====================================================
       STATUS BREAKDOWN
    ====================================================== */

    const statusBreakdown =
      await SupportTicket.aggregate<{
        _id:
          | "Open"
          | "Waiting for Customer"
          | "In Progress"
          | "Escalated"
          | "Resolved";
        count: number;
      }>([
        {
          $match: {
            createdAt: {
              $gte:
                startDate,
            },
          },
        },
        {
          $group: {
            _id:
              "$status",
            count: {
              $sum:
                1,
            },
          },
        },
        {
          $sort: {
            count:
              -1,
          },
        },
      ]);

    /* =====================================================
       PRIORITY BREAKDOWN
    ====================================================== */

    const priorityBreakdown =
      await SupportTicket.aggregate<{
        _id:
          | "Low"
          | "Normal"
          | "High"
          | "Urgent";
        count: number;
      }>([
        {
          $match: {
            createdAt: {
              $gte:
                startDate,
            },
          },
        },
        {
          $group: {
            _id:
              "$priority",
            count: {
              $sum:
                1,
            },
          },
        },
        {
          $sort: {
            count:
              -1,
          },
        },
      ]);

    /* =====================================================
       CATEGORY BREAKDOWN
    ====================================================== */

    const categoryBreakdown =
      await SupportTicket.aggregate<{
        _id: string;
        count: number;
      }>([
        {
          $match: {
            createdAt: {
              $gte:
                startDate,
            },
          },
        },
        {
          $group: {
            _id:
              "$category",
            count: {
              $sum:
                1,
            },
          },
        },
        {
          $sort: {
            count:
              -1,
          },
        },
      ]);

    /* =====================================================
       DAILY TICKET TREND
    ====================================================== */

    const dailyTickets =
      await SupportTicket.aggregate<{
        _id: {
          date: string;
        };
        count: number;
      }>([
        {
          $match: {
            createdAt: {
              $gte:
                startDate,
            },
          },
        },
        {
          $group: {
            _id: {
              date: {
                $dateToString: {
                  format:
                    "%Y-%m-%d",
                  date:
                    "$createdAt",
                },
              },
            },

            count: {
              $sum:
                1,
            },
          },
        },
        {
          $sort: {
            "_id.date":
              1,
          },
        },
      ]);

    /* =====================================================
       DAILY RESOLUTION TREND
    ====================================================== */

    const dailyResolved =
      await SupportTicket.aggregate<{
        _id: {
          date: string;
        };
        count: number;
      }>([
        {
          $match: {
            resolvedAt: {
              $gte:
                startDate,
            },
          },
        },
        {
          $group: {
            _id: {
              date: {
                $dateToString: {
                  format:
                    "%Y-%m-%d",
                  date:
                    "$resolvedAt",
                },
              },
            },

            count: {
              $sum:
                1,
            },
          },
        },
        {
          $sort: {
            "_id.date":
              1,
          },
        },
      ]);

    /* =====================================================
       ACTIVITY BREAKDOWN
    ====================================================== */

    const activityBreakdown =
      await SupportActivity.aggregate<{
        _id: string;
        count: number;
      }>([
        {
          $match: {
            createdAt: {
              $gte:
                startDate,
            },
          },
        },
        {
          $group: {
            _id:
              "$eventType",
            count: {
              $sum:
                1,
            },
          },
        },
        {
          $sort: {
            count:
              -1,
          },
        },
      ]);

    /* =====================================================
       CSAT
    ====================================================== */

    const csatRows =
      await SupportTicket.aggregate<{
        average:
          number;
        count:
          number;
      }>([
        {
          $match: {
            createdAt: {
              $gte:
                startDate,
            },

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

            count: {
              $sum:
                1,
            },
          },
        },
      ]);

    const csat =
      csatRows[0];

    /* =====================================================
       RATES
    ====================================================== */

    const resolutionRate =
      totalTickets > 0
        ? Number(
            (
              (resolvedTickets /
                totalTickets) *
              100
            ).toFixed(1)
          )
        : 0;

    const escalationRate =
      totalTickets > 0
        ? Number(
            (
              (escalatedTickets /
                totalTickets) *
              100
            ).toFixed(1)
          )
        : 0;

    const breachRate =
      totalTickets > 0
        ? Number(
            (
              (breachedTickets /
                totalTickets) *
              100
            ).toFixed(1)
          )
        : 0;

    return {
      period: {
        days:
          safeDays,

        startDate:
          startDate.toISOString(),

        endDate:
          now.toISOString(),
      },

      summary: {
        totalTickets,
        resolvedTickets,
        openTickets,
        escalatedTickets,
        breachedTickets,
        waitingCustomerTickets,
        urgentTickets,

        resolutionRate,
        escalationRate,
        breachRate,

        csat:
          typeof csat?.average ===
          "number"
            ? Number(
                csat.average.toFixed(
                  1
                )
              )
            : null,

        csatResponses:
          csat?.count ??
          0,
      },

      statusBreakdown:
        statusBreakdown.map(
          (item) => ({
            status:
              item._id,
            count:
              item.count,
          })
        ),

      priorityBreakdown:
        priorityBreakdown.map(
          (item) => ({
            priority:
              item._id,
            count:
              item.count,
          })
        ),

      categoryBreakdown:
        categoryBreakdown.map(
          (item) => ({
            category:
              item._id,
            count:
              item.count,
          })
        ),

      dailyTickets:
        dailyTickets.map(
          (item) => ({
            date:
              item._id.date,
            count:
              item.count,
          })
        ),

      dailyResolved:
        dailyResolved.map(
          (item) => ({
            date:
              item._id.date,
            count:
              item.count,
          })
        ),

      activityBreakdown:
        activityBreakdown.map(
          (item) => ({
            eventType:
              item._id,
            count:
              item.count,
          })
        ),
    };
  };