import crypto from "crypto";
import mongoose from "mongoose";

import {
  SupportTicket,
} from "../models/SupportTicket.js";

import {
  SupportMessage,
} from "../models/SupportMessage.js";

import {
  SupportActivity,
} from "../models/SupportActivity.js";

import {
  User,
} from "../models/User.js";

import {
  createLookupHash,
  decryptData,
  encryptData,
  normalizeEmail,
} from "../utils/crypto.js";

import {
  calculateSupportSlaDueAt,
  getSupportSlaRemainingMinutes,
} from "./supportSlaService.js";

import {
  recordSupportActivity,
} from "./supportActivityService.js";

import type {
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
} from "../types/support.js";

const VALID_STATUS:
  SupportTicketStatus[] = [
  "Open",
  "Waiting for Customer",
  "In Progress",
  "Escalated",
  "Resolved",
];

const VALID_PRIORITY:
  SupportTicketPriority[] = [
  "Low",
  "Normal",
  "High",
  "Urgent",
];

const VALID_CATEGORY:
  SupportTicketCategory[] = [
  "Transfer",
  "Withdrawal",
  "Deposit",
  "KYC",
  "Security",
  "Account",
  "Payment",
  "Other",
];

const decryptSafe =
  (
    value:
      any
  ) => {
    if (
      !value
    ) {
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

const escapeRegex =
  (
    value:
      string
  ) =>
    value.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

const normalizeTags =
  (
    value:
      unknown
  ) => {
    if (
      !Array.isArray(
        value
      )
    ) {
      return [];
    }

    return Array.from(
      new Set(
        value
          .filter(
            (
              item
            ):
              item is
                string =>
              typeof item ===
              "string"
          )
          .map(
            (
              item
            ) =>
              item
                .trim()
                .slice(
                  0,
                  40
                )
          )
          .filter(
            Boolean
          )
      )
    ).slice(
      0,
      12
    );
  };

const createTicketNumber =
  () =>
    `SUP-${Date.now()
      .toString()
      .slice(
        -6
      )}${crypto.randomInt(
      100,
      1000
    )}`;

const getAdminName =
  async (
    adminId:
      string
  ) => {
    const admin =
      await User.findOne({
        _id:
          adminId,
        role:
          "admin",
        accountStatus:
          "active",
      })
        .select(
          "name"
        )
        .lean();

    return admin?.name ??
      "Administrator";
  };

const findCustomerByEmail =
  async (
    email:
      string
  ) => {
    const normalized =
      normalizeEmail(
        email
      );

    if (
      !normalized
    ) {
      return null;
    }

    return User.findOne({
      emailLookup:
        createLookupHash(
          normalized
        ),
      accountStatus:
        "active",
    });
  };

const mapAssignee =
  (
    admin:
      any
  ) => ({
    id:
      admin
        ? admin._id.toString()
        : null,
    name:
      admin?.name ??
      "Unassigned",
  });

export const createSupportTicket =
  async ({
    customerEmail,
    subject,
    description,
    category,
    priority,
    relatedReference,
    tags,
    adminId,
  }: {
    customerEmail:
      string;
    subject:
      string;
    description:
      string;
    category:
      SupportTicketCategory;
    priority:
      SupportTicketPriority;
    relatedReference?:
      string;
    tags?:
      string[];
    adminId:
      string;
  }) => {
    const customer =
      await findCustomerByEmail(
        customerEmail
      );

    if (
      !customer
    ) {
      throw new Error(
        "CUSTOMER_NOT_FOUND"
      );
    }

    if (
      !VALID_CATEGORY.includes(
        category
      )
    ) {
      throw new Error(
        "INVALID_CATEGORY"
      );
    }

    if (
      !VALID_PRIORITY.includes(
        priority
      )
    ) {
      throw new Error(
        "INVALID_PRIORITY"
      );
    }

    const cleanSubject =
      subject
        .trim()
        .slice(
          0,
          180
        );

    const cleanDescription =
      description
        .trim()
        .slice(
          0,
          4000
        );

    if (
      cleanSubject.length <
        4 ||
      cleanDescription.length <
        4
    ) {
      throw new Error(
        "INVALID_CONTENT"
      );
    }

    const adminName =
      await getAdminName(
        adminId
      );

    let ticket:
      any =
      null;

    for (
      let attempt =
        0;
      attempt <
        3;
      attempt +=
        1
    ) {
      try {
        ticket =
          await SupportTicket.create({
            ticketNumber:
              createTicketNumber(),
            customerUserId:
              customer._id,
            subject:
              cleanSubject,
            descriptionEncrypted:
              encryptData(
                cleanDescription
              ),
            category,
            priority,
            status:
              "Open",
            waitingOn:
              "admin",
            relatedReference:
              relatedReference
                ?.trim()
                .slice(
                  0,
                  180
                ),
            tags:
              normalizeTags(
                tags
              ),
            slaDueAt:
              calculateSupportSlaDueAt(
                priority
              ),
            lastActivityAt:
              new Date(),
            createdByAdminId:
              adminId,
          });

        break;
      } catch (
        error:
          any
      ) {
        if (
          error?.code !==
            11000 ||
          attempt ===
            2
        ) {
          throw error;
        }
      }
    }

    if (
      !ticket
    ) {
      throw new Error(
        "TICKET_CREATE_FAILED"
      );
    }

    await recordSupportActivity({
      ticketId:
        ticket._id.toString(),
      eventType:
        "TICKET_CREATED",
      summary:
        `Ticket ${ticket.ticketNumber} created.`,
      actorAdminId:
        adminId,
      actorName:
        adminName,
    });

    return ticket;
  };

export const buildSupportTicketQuery =
  async ({
    search,
    status,
    priority,
    category,
    sla,
  }: {
    search?:
      string;
    status?:
      string;
    priority?:
      string;
    category?:
      string;
    sla?:
      string;
  }) => {
    const query:
      Record<
        string,
        any
      > = {};

    if (
      status &&
      VALID_STATUS.includes(
        status as
          SupportTicketStatus
      )
    ) {
      query.status =
        status;
    }

    if (
      priority &&
      VALID_PRIORITY.includes(
        priority as
          SupportTicketPriority
      )
    ) {
      query.priority =
        priority;
    }

    if (
      category &&
      VALID_CATEGORY.includes(
        category as
          SupportTicketCategory
      )
    ) {
      query.category =
        category;
    }

    const now =
      new Date();

    if (
      sla ===
      "Due Soon"
    ) {
      query.status = {
        $ne:
          "Resolved",
      };
      query.slaDueAt = {
        $gt:
          now,
        $lte:
          new Date(
            now.getTime() +
              15 *
                60 *
                1000
          ),
      };
    }

    if (
      sla ===
      "Breached"
    ) {
      query.status = {
        $ne:
          "Resolved",
      };
      query.slaDueAt = {
        $lte:
          now,
      };
    }

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
      const or:
        Record<
          string,
          any
        >[] = [
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

      if (
        cleanSearch.includes(
          "@"
        )
      ) {
        const normalized =
          normalizeEmail(
            cleanSearch
          );

        if (
          normalized
        ) {
          const customer =
            await User.findOne({
              emailLookup:
                createLookupHash(
                  normalized
                ),
            })
              .select(
                "_id"
              )
              .lean();

          if (
            customer
          ) {
            or.push({
              customerUserId:
                customer._id,
            });
          }
        }
      } else {
        const users =
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
            .select(
              "_id"
            )
            .limit(
              20
            )
            .lean();

        if (
          users.length
        ) {
          or.push({
            customerUserId: {
              $in:
                users.map(
                  (
                    user
                  ) =>
                    user._id
                ),
            },
          });
        }
      }

      query.$or =
        or;
    }

    return query;
  };

const loadUserMaps =
  async (
    tickets:
      any[]
  ) => {
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

    const adminIds =
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
      admins,
    ] =
      await Promise.all([
        customerIds.length
          ? User.find({
              _id: {
                $in:
                  customerIds,
              },
            })
              .select(
                "name emailEncrypted kycStatus walletId"
              )
              .lean()
          : [],
        adminIds.length
          ? User.find({
              _id: {
                $in:
                  adminIds,
              },
              role:
                "admin",
            })
              .select(
                "name"
              )
              .lean()
          : [],
      ]);

    return {
      customerMap:
        new Map(
          customers.map(
            (
              user:
                any
            ) => [
              user._id.toString(),
              user,
            ]
          )
        ),
      adminMap:
        new Map(
          admins.map(
            (
              user:
                any
            ) => [
              user._id.toString(),
              user,
            ]
          )
        ),
    };
  };

export const listSupportTickets =
  async ({
    query,
    page,
    limit,
  }: {
    query:
      Record<
        string,
        any
      >;
    page:
      number;
    limit:
      number;
  }) => {
    const skip =
      (
        page -
        1
      ) *
      limit;

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
            limit
          )
          .lean(),
        SupportTicket.countDocuments(
          query
        ),
      ]);

    const {
      customerMap,
      adminMap,
    } =
      await loadUserMaps(
        tickets
      );

    return {
      tickets:
        tickets.map(
          (
            ticket:
              any
          ) => {
            const customer =
              customerMap.get(
                ticket.customerUserId.toString()
              ) as
                | any
                | undefined;

            const admin =
              ticket.assigneeAdminId
                ? adminMap.get(
                    ticket.assigneeAdminId.toString()
                  )
                : null;

            const slaMinutes =
              getSupportSlaRemainingMinutes(
                new Date(
                  ticket.slaDueAt
                )
              );

            return {
              id:
                ticket._id.toString(),
              ticketNumber:
                ticket.ticketNumber,
              customerUserId:
                ticket.customerUserId.toString(),
              customerName:
                customer?.name ??
                "Unknown customer",
              customerEmail:
                decryptSafe(
                  customer?.emailEncrypted
                ),
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
              assignee:
                mapAssignee(
                  admin
                ),
              slaMinutes,
              slaBreached:
                ticket.status !==
                  "Resolved" &&
                slaMinutes <=
                  0,
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
    };
  };

export const getSupportTicketDetail =
  async (
    ticketId:
      string
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
      ).lean();

    if (
      !ticket
    ) {
      return null;
    }

    const [
      customer,
      assignee,
      messages,
      activity,
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
                "name"
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
        SupportActivity.find({
          ticketId:
            ticket._id,
        })
          .sort({
            createdAt:
              -1,
          })
          .limit(
            100
          )
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
                message:
                  any
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
              "name"
            )
            .lean()
        : [];

    const authorMap =
      new Map(
        authors.map(
          (
            user:
              any
          ) => [
            user._id.toString(),
            user.name,
          ]
        )
      );

    const slaMinutes =
      getSupportSlaRemainingMinutes(
        new Date(
          ticket.slaDueAt
        )
      );

    return {
      id:
        ticket._id.toString(),
      ticketNumber:
        ticket.ticketNumber,
      customerUserId:
        ticket.customerUserId.toString(),
      customerName:
        customer.name,
      customerEmail:
        decryptSafe(
          customer.emailEncrypted
        ),
      subject:
        ticket.subject,
      description:
        decryptSafe(
          ticket.descriptionEncrypted
        ),
      category:
        ticket.category,
      priority:
        ticket.priority,
      status:
        ticket.status,
      waitingOn:
        ticket.waitingOn,
      assignee:
        mapAssignee(
          assignee
        ),
      slaMinutes,
      slaBreached:
        ticket.status !==
          "Resolved" &&
        slaMinutes <=
          0,
      lastActivityAt:
        new Date(
          ticket.lastActivityAt
        ).toISOString(),
      createdAt:
        new Date(
          ticket.createdAt
        ).toISOString(),
      relatedReference:
        ticket.relatedReference ??
        "",
      tags:
        ticket.tags ??
        [],
      customer: {
        userId:
          customer._id.toString(),
        name:
          customer.name,
        email:
          decryptSafe(
            customer.emailEncrypted
          ),
        kycStatus:
          customer.kycStatus ??
          "not_started",
        walletLinked:
          Boolean(
            customer.walletId
          ),
      },
      messages:
        messages.map(
          (
            message:
              any
          ) => ({
            id:
              message._id.toString(),
            visibility:
              message.visibility,
            authorType:
              message.authorType,
            authorName:
              message.authorAdminId
                ? authorMap.get(
                    message.authorAdminId.toString()
                  ) ??
                  "Administrator"
                : message.authorUserId
                  ? authorMap.get(
                      message.authorUserId.toString()
                    ) ??
                    customer.name
                  : "System",
            body:
              decryptSafe(
                message.bodyEncrypted
              ),
            createdAt:
              new Date(
                message.createdAt
              ).toISOString(),
          })
        ),
      activity:
        activity.map(
          (
            item:
              any
          ) => ({
            id:
              item._id.toString(),
            eventType:
              item.eventType,
            summary:
              item.summary,
            actorName:
              item.actorName,
            createdAt:
              new Date(
                item.createdAt
              ).toISOString(),
          })
        ),
      firstResponseAt:
        ticket.firstResponseAt
          ? new Date(
              ticket.firstResponseAt
            ).toISOString()
          : null,
      resolvedAt:
        ticket.resolvedAt
          ? new Date(
              ticket.resolvedAt
            ).toISOString()
          : null,
    };
  };

export const updateSupportTicket =
  async ({
    ticketId,
    adminId,
    status,
    priority,
    category,
    assigneeAdminId,
    tags,
  }: {
    ticketId:
      string;
    adminId:
      string;
    status?:
      SupportTicketStatus;
    priority?:
      SupportTicketPriority;
    category?:
      SupportTicketCategory;
    assigneeAdminId?:
      string |
      null;
    tags?:
      string[];
  }) => {
    const ticket =
      await SupportTicket.findById(
        ticketId
      );

    if (
      !ticket
    ) {
      return null;
    }

    const adminName =
      await getAdminName(
        adminId
      );

    if (
      status !==
      undefined
    ) {
      if (
        !VALID_STATUS.includes(
          status
        )
      ) {
        throw new Error(
          "INVALID_STATUS"
        );
      }

      const previous =
        ticket.status;

      ticket.status =
        status;

      if (
        status ===
        "Resolved"
      ) {
        ticket.waitingOn =
          "none";
        ticket.resolvedAt =
          new Date();
      } else if (
        previous ===
        "Resolved"
      ) {
        ticket.resolvedAt =
          undefined;
      }

      if (
        previous !==
        status
      ) {
        await recordSupportActivity({
          ticketId,
          eventType:
            previous ===
            "Resolved"
              ? "REOPENED"
              : "STATUS_CHANGED",
          summary:
            `Status changed from ${previous} to ${status}.`,
          actorAdminId:
            adminId,
          actorName:
            adminName,
        });
      }
    }

    if (
      priority !==
      undefined
    ) {
      if (
        !VALID_PRIORITY.includes(
          priority
        )
      ) {
        throw new Error(
          "INVALID_PRIORITY"
        );
      }

      const previous =
        ticket.priority;

      ticket.priority =
        priority;

      if (
        previous !==
        priority
      ) {
        ticket.slaDueAt =
          calculateSupportSlaDueAt(
            priority
          );

        await recordSupportActivity({
          ticketId,
          eventType:
            "PRIORITY_CHANGED",
          summary:
            `Priority changed from ${previous} to ${priority}.`,
          actorAdminId:
            adminId,
          actorName:
            adminName,
        });
      }
    }

    if (
      category !==
      undefined
    ) {
      if (
        !VALID_CATEGORY.includes(
          category
        )
      ) {
        throw new Error(
          "INVALID_CATEGORY"
        );
      }

      const previous =
        ticket.category;
      ticket.category =
        category;

      if (
        previous !==
        category
      ) {
        await recordSupportActivity({
          ticketId,
          eventType:
            "CATEGORY_CHANGED",
          summary:
            `Category changed from ${previous} to ${category}.`,
          actorAdminId:
            adminId,
          actorName:
            adminName,
        });
      }
    }

    if (
      assigneeAdminId !==
      undefined
    ) {
      if (
        assigneeAdminId ===
        null ||
        assigneeAdminId ===
        ""
      ) {
        ticket.assigneeAdminId =
          undefined;
      } else {
        const assignee =
          await User.findOne({
            _id:
              assigneeAdminId,
            role:
              "admin",
            accountStatus:
              "active",
          })
            .select(
              "_id"
            )
            .lean();

        if (
          !assignee
        ) {
          throw new Error(
            "INVALID_ASSIGNEE"
          );
        }

        ticket.assigneeAdminId =
          assignee._id;
      }

      await recordSupportActivity({
        ticketId,
        eventType:
          "ASSIGNEE_CHANGED",
        summary:
          assigneeAdminId
            ? "Ticket owner updated."
            : "Ticket returned to the unassigned queue.",
        actorAdminId:
          adminId,
        actorName:
          adminName,
      });
    }

    if (
      tags !==
      undefined
    ) {
      ticket.tags =
        normalizeTags(
          tags
        );
    }

    ticket.lastActivityAt =
      new Date();

    await ticket.save();

    return ticket;
  };

export const addAdminSupportMessage =
  async ({
    ticketId,
    adminId,
    body,
    visibility,
  }: {
    ticketId:
      string;
    adminId:
      string;
    body:
      string;
    visibility:
      "public" |
      "internal";
  }) => {
    const cleanBody =
      body
        .trim()
        .slice(
          0,
          4000
        );

    if (
      !cleanBody
    ) {
      throw new Error(
        "EMPTY_MESSAGE"
      );
    }

    const ticket =
      await SupportTicket.findById(
        ticketId
      );

    if (
      !ticket
    ) {
      return null;
    }

    const adminName =
      await getAdminName(
        adminId
      );

    await SupportMessage.create({
      ticketId:
        ticket._id,
      visibility,
      authorType:
        "admin",
      authorAdminId:
        adminId,
      bodyEncrypted:
        encryptData(
          cleanBody
        ),
    });

    if (
      visibility ===
      "public"
    ) {
      ticket.waitingOn =
        "customer";

      if (
        !ticket.firstResponseAt
      ) {
        ticket.firstResponseAt =
          new Date();
      }

      if (
        ticket.status ===
        "Open"
      ) {
        ticket.status =
          "In Progress";
      }
    }

    ticket.lastActivityAt =
      new Date();

    await ticket.save();

    await recordSupportActivity({
      ticketId,
      eventType:
        visibility ===
        "public"
          ? "ADMIN_REPLY"
          : "INTERNAL_NOTE",
      summary:
        visibility ===
        "public"
          ? "Administrator replied to the customer."
          : "Internal support note added.",
      actorAdminId:
        adminId,
      actorName:
        adminName,
    });

    return ticket;
  };

export const escalateSupportTicket =
  async ({
    ticketId,
    adminId,
    reason,
  }: {
    ticketId:
      string;
    adminId:
      string;
    reason:
      string;
  }) => {
    const ticket =
      await SupportTicket.findById(
        ticketId
      );

    if (
      !ticket
    ) {
      return null;
    }

    const adminName =
      await getAdminName(
        adminId
      );

    ticket.status =
      "Escalated";
    ticket.waitingOn =
      "admin";
    ticket.lastActivityAt =
      new Date();

    await ticket.save();

    await recordSupportActivity({
      ticketId,
      eventType:
        "ESCALATED",
      summary:
        `Ticket escalated: ${reason
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 160)}`,
      actorAdminId:
        adminId,
      actorName:
        adminName,
    });

    return ticket;
  };

export const resolveSupportTicket =
  async ({
    ticketId,
    adminId,
    resolution,
  }: {
    ticketId:
      string;
    adminId:
      string;
    resolution:
      string;
  }) => {
    const clean =
      resolution
        .trim()
        .slice(
          0,
          2000
        );

    if (
      !clean
    ) {
      throw new Error(
        "EMPTY_RESOLUTION"
      );
    }

    const ticket =
      await SupportTicket.findById(
        ticketId
      );

    if (
      !ticket
    ) {
      return null;
    }

    const adminName =
      await getAdminName(
        adminId
      );

    ticket.status =
      "Resolved";
    ticket.waitingOn =
      "none";
    ticket.resolvedAt =
      new Date();
    ticket.resolutionEncrypted =
      encryptData(
        clean
      );
    ticket.lastActivityAt =
      new Date();

    await ticket.save();

    await recordSupportActivity({
      ticketId,
      eventType:
        "RESOLVED",
      summary:
        "Ticket resolved by support.",
      actorAdminId:
        adminId,
      actorName:
        adminName,
    });

    return ticket;
  };
