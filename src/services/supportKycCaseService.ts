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
   LIST KYC CASES
---------------------------------------------------------
Support tickets categorized as KYC.
========================================================= */

export const listSupportKycCases =
  async ({
    search,
    status,
    priority,
    kycStatus,
    page = 1,
    limit = 20,
  }: {
    search?: string;
    status?: string;
    priority?: string;
    kycStatus?: string;
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
        "KYC",
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
        cases: [],
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
       CUSTOMERS
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

    const customers =
      await User.find({
        _id: {
          $in:
            customerIds,
        },
      })
        .select(
          "name emailEncrypted phoneEncrypted role kycStatus walletId emailVerified emailVerifiedAt"
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
       KYC STATUS FILTER
    ====================================================== */

    const filteredTickets =
      kycStatus &&
      [
        "not_started",
        "pending",
        "verified",
        "rejected",
      ].includes(
        kycStatus
      )
        ? tickets.filter(
            (
              ticket
            ) => {
              const customer =
                customerMap.get(
                  ticket.customerUserId.toString()
                );

              return (
                customer?.kycStatus ===
                kycStatus
              );
            }
          )
        : tickets;

    /*
     * When filtering by KYC status we already paginated the
     * ticket query before filtering, so do not pretend that
     * the returned total is the complete filtered total.
     *
     * To keep pagination semantics correct, use a second
     * customer-ID filter only when kycStatus is supplied.
     */
    if (
      kycStatus &&
      [
        "not_started",
        "pending",
        "verified",
        "rejected",
      ].includes(
        kycStatus
      )
    ) {
      const matchingCustomerIds =
        customers
          .filter(
            (
              customer
            ) =>
              customer.kycStatus ===
              kycStatus
          )
          .map(
            (
              customer
            ) =>
              customer._id
          );

      const filteredQuery: Record<
        string,
        unknown
      > = {
        ...query,
        customerUserId: {
          $in:
            matchingCustomerIds,
        },
      };

      const [
        filteredTickets,
        filteredTotal,
      ] =
        await Promise.all([
          SupportTicket.find(
            filteredQuery
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
            filteredQuery
          ),
        ]);

      const filteredCustomerIds =
        Array.from(
          new Set(
            filteredTickets.map(
              (
                ticket
              ) =>
                ticket.customerUserId.toString()
            )
          )
        );

      const filteredCustomers =
        customers.filter(
          (
            customer
          ) =>
            filteredCustomerIds.includes(
              customer._id.toString()
            )
        );

      const filteredCustomerMap =
        new Map(
          filteredCustomers.map(
            (
              customer
            ) => [
              customer._id.toString(),
              customer,
            ]
          )
        );

      return {
        cases:
          filteredTickets.map(
            (
              ticket
            ) => {
              const customer =
                filteredCustomerMap.get(
                  ticket.customerUserId.toString()
                ) as
                  | any
                  | undefined;

              return mapKycCase(
                ticket,
                customer
              );
            }
          ),

        total:
          filteredTotal,

        page:
          safePage,

        limit:
          safeLimit,

        totalPages:
          Math.ceil(
            filteredTotal /
              safeLimit
          ),
      };
    }

    return {
      cases:
        filteredTickets.map(
          (
            ticket
          ) => {
            const customer =
              customerMap.get(
                ticket.customerUserId.toString()
              ) as
                | any
                | undefined;

            return mapKycCase(
              ticket,
              customer
            );
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