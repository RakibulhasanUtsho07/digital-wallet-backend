import mongoose from "mongoose";

import {
  SupportTicket,
} from "../models/SupportTicket.js";

import {
  SupportMessage,
} from "../models/SupportMessage.js";

import {
  User,
} from "../models/User.js";

import {
  decryptData,
  createLookupHash,
  normalizeEmail,
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
   GET SUPPORT CONVERSATIONS
---------------------------------------------------------
Returns ticket-level conversation history for Support.
========================================================= */

export const getSupportConversations =
  async ({
    search,
    status,
    page = 1,
    limit = 20,
  }: {
    search?: string;
    status?: string;
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

    const ticketQuery:
      Record<string, unknown> = {};

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
      ticketQuery.status =
        status;
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

    if (cleanSearch) {
      const or:
        Record<string, unknown>[] =
        [
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

      /*
       * Customer email lookup uses
       * the existing hashed lookup field.
       */
      if (
        cleanSearch.includes("@")
      ) {
        const normalizedEmail =
          normalizeEmail(
            cleanSearch
          );

        if (
          normalizedEmail
        ) {
          const customer =
            await User.findOne({
              emailLookup:
                createLookupHash(
                  normalizedEmail
                ),
            })
              .select("_id")
              .lean();

          if (customer) {
            or.push({
              customerUserId:
                customer._id,
            });
          }
        }
      } else {
        /*
         * Customer name search.
         */
        const customers =
          await User.find({
            name: {
              $regex:
                escapeRegex(
                  cleanSearch
                ),
              $options:
                "i",
            },
          })
            .select("_id")
            .limit(30)
            .lean();

        if (
          customers.length
        ) {
          or.push({
            customerUserId: {
              $in:
                customers.map(
                  (
                    customer
                  ) =>
                    customer._id
                ),
            },
          });
        }
      }

      ticketQuery.$or =
        or;
    }

    const [
      tickets,
      total,
    ] =
      await Promise.all([
        SupportTicket.find(
          ticketQuery
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
          ticketQuery
        ),
      ]);

    if (!tickets.length) {
      return {
        conversations: [],
        total,
        page: safePage,
        limit: safeLimit,
        totalPages:
          Math.ceil(
            total /
              safeLimit
          ),
      };
    }

    /* =====================================================
       LOAD CUSTOMERS
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
       LOAD ASSIGNEES
    ====================================================== */

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
       LOAD LAST MESSAGE FOR EACH TICKET
    ====================================================== */

    const ticketIds =
      tickets.map(
        (
          ticket
        ) =>
          ticket._id
      );

    const messages =
      await SupportMessage.find({
        ticketId: {
          $in:
            ticketIds,
        },
      })
        .sort({
          createdAt:
            -1,
        })
        .lean();

    const lastMessageMap =
      new Map<
        string,
        any
      >();

    for (
      const message of messages
    ) {
      const ticketId =
        message.ticketId.toString();

      if (
        !lastMessageMap.has(
          ticketId
        )
      ) {
        lastMessageMap.set(
          ticketId,
          message
        );
      }
    }

    return {
      conversations:
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

            const lastMessage =
              lastMessageMap.get(
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

              assignee: assignee
                ? {
                    id:
                      assignee._id.toString(),

                    name:
                      assignee.name,

                    role:
                      assignee.role,
                  }
                : null,

              lastMessage:
                lastMessage
                  ? {
                      id:
                        lastMessage._id.toString(),

                      visibility:
                        lastMessage.visibility,

                      authorType:
                        lastMessage.authorType,

                      body:
                        safeDecrypt(
                          lastMessage.bodyEncrypted
                        ),

                      createdAt:
                        new Date(
                          lastMessage.createdAt
                        ).toISOString(),
                    }
                  : null,

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

/* =========================================================
   GET FULL CONVERSATION
---------------------------------------------------------
A dedicated conversation endpoint can reuse the ticket
message store while returning only conversation data.
========================================================= */

export const getSupportConversation =
  async (
    ticketId: string
  ) => {
    if (
      !mongoose.Types.ObjectId.isValid(
        ticketId
      )
    ) {
      return null;
    }

    const ticket =
      await SupportTicket.findById(
        ticketId
      )
        .select(
          "_id ticketNumber customerUserId subject category priority status waitingOn assigneeAdminId createdAt lastActivityAt"
        )
        .lean();

    if (
      !ticket
    ) {
      return null;
    }

    const [
      customer,
      assignee,
      messages,
    ] =
      await Promise.all([
        User.findById(
          ticket.customerUserId
        )
          .select(
            "name emailEncrypted"
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

        SupportMessage.find({
          ticketId:
            ticket._id,
        })
          .sort({
            createdAt:
              1,
          })
          .lean(),
      ]);

    if (
      !customer
    ) {
      return null;
    }

    const authorIds =
      Array.from(
        new Set(
          messages
            .flatMap(
              (
                message
              ) => [
                message.authorAdminId?.toString(),
                message.authorUserId?.toString(),
              ]
            )
            .filter(
              Boolean
            )
        )
      );

    const authors =
      authorIds.length
        ? await User.find({
            _id: {
              $in:
                authorIds,
            },
          })
            .select(
              "name role"
            )
            .lean()
        : [];

    const authorMap =
      new Map(
        authors.map(
          (
            author
          ) => [
            author._id.toString(),
            author,
          ]
        )
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
          customer._id.toString(),

        name:
          customer.name,

        email:
          safeDecrypt(
            customer.emailEncrypted
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

      messages:
        messages.map(
          (
            message
          ) => {
            const authorId =
              message.authorAdminId?.toString() ??
              message.authorUserId?.toString();

            const author =
              authorId
                ? authorMap.get(
                    authorId
                  )
                : null;

            return {
              id:
                message._id.toString(),

              visibility:
                message.visibility,

              authorType:
                message.authorType,

              authorId:
                authorId ??
                null,

              authorName:
                author?.name ??
                (
                  message.authorType ===
                  "customer"
                    ? customer.name
                    : "System"
                ),

              authorRole:
                author?.role ??
                null,

              body:
                safeDecrypt(
                  message.bodyEncrypted
                ),

              createdAt:
                new Date(
                  message.createdAt
                ).toISOString(),

              updatedAt:
                new Date(
                  message.updatedAt
                ).toISOString(),
            };
          }
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