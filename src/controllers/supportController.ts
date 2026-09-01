import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  User,
} from "../models/User.js";

import {
  getSupportOverview,
} from "../services/supportAnalyticsService.js";

import {
  addAdminSupportMessage,
  buildSupportTicketQuery,
  createSupportTicket,
  escalateSupportTicket,
  getSupportTicketDetail,
  listSupportTickets,
  resolveSupportTicket,
  updateSupportTicket,
} from "../services/supportTicketService.js";

import type {
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
} from "../types/support.js";

const asString = (
  value: unknown
): string => {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string"
      ? first
      : "";
  }

  return "";
};

const getAdminId = (
  req: AuthRequest,
  res: Response
): string | null => {
  const id =
    req.user?._id;

  if (!id) {
    res.status(401).json({
      success: false,
      message:
        "Authentication is required.",
    });

    return null;
  }

  return id;
};

const mapServiceError = (
  error: unknown
) => {
  const code =
    error instanceof Error
      ? error.message
      : "";

  const map:
    Record<
      string,
      {
        status: number;
        message: string;
      }
    > = {
    CUSTOMER_NOT_FOUND: {
      status: 404,
      message:
        "No active customer account was found for that email.",
    },
    INVALID_CATEGORY: {
      status: 400,
      message:
        "Invalid support category.",
    },
    INVALID_PRIORITY: {
      status: 400,
      message:
        "Invalid ticket priority.",
    },
    INVALID_STATUS: {
      status: 400,
      message:
        "Invalid ticket status.",
    },
    INVALID_ASSIGNEE: {
      status: 400,
      message:
        "The selected assignee is not an active administrator.",
    },
    INVALID_CONTENT: {
      status: 400,
      message:
        "Ticket subject and description are too short.",
    },
    EMPTY_MESSAGE: {
      status: 400,
      message:
        "Message body is required.",
    },
    EMPTY_RESOLUTION: {
      status: 400,
      message:
        "Resolution summary is required.",
    },
  };

  return (
    map[code] ?? {
      status: 500,
      message:
        "Support operation failed.",
    }
  );
};

export const getSupportOverviewController =
  async (
    _req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const overview =
        await getSupportOverview();

      res.status(200).json({
        success: true,
        ...overview,
      });
    } catch (error) {
      console.error(
        "GET SUPPORT OVERVIEW ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to load support overview.",
      });
    }
  };

export const getSupportTicketsController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const page =
        Math.max(
          1,
          Number(req.query.page) ||
            1
        );

      const limit =
        Math.min(
          100,
          Math.max(
            1,
            Number(req.query.limit) ||
              20
          )
        );

      const query =
        await buildSupportTicketQuery({
          search:
            asString(
              req.query.search
            ),
          status:
            asString(
              req.query.status
            ),
          priority:
            asString(
              req.query.priority
            ),
          category:
            asString(
              req.query.category
            ),
          sla:
            asString(
              req.query.sla
            ),
        });

      const result =
        await listSupportTickets({
          query,
          page,
          limit,
        });

      res.status(200).json({
        success: true,
        tickets:
          result.tickets,
        pagination: {
          page,
          limit,
          total:
            result.total,
          pages:
            Math.max(
              1,
              Math.ceil(
                result.total /
                  limit
              )
            ),
        },
      });
    } catch (error) {
      console.error(
        "GET SUPPORT TICKETS ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to load support tickets.",
      });
    }
  };

export const getSupportTicketController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const ticket =
        await getSupportTicketDetail(
          asString(
            req.params.id
          )
        );

      if (!ticket) {
        res.status(404).json({
          success: false,
          message:
            "Support ticket not found.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        ticket,
      });
    } catch (error) {
      console.error(
        "GET SUPPORT TICKET ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to load the support ticket.",
      });
    }
  };

export const createSupportTicketController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    const adminId =
      getAdminId(
        req,
        res
      );

    if (!adminId) return;

    try {
      const ticket =
        await createSupportTicket({
          customerEmail:
            asString(
              req.body
                ?.customerEmail
            ),
          subject:
            asString(
              req.body
                ?.subject
            ),
          description:
            asString(
              req.body
                ?.description
            ),
          category:
            asString(
              req.body
                ?.category
            ) as SupportTicketCategory,
          priority:
            asString(
              req.body
                ?.priority
            ) as SupportTicketPriority,
          relatedReference:
            asString(
              req.body
                ?.relatedReference
            ) ||
            undefined,
          tags:
            req.body
              ?.tags,
          adminId,
        });

      const detail =
        await getSupportTicketDetail(
          ticket._id.toString()
        );

      res.status(201).json({
        success: true,
        message:
          "Support ticket created.",
        ticket:
          detail,
      });
    } catch (error) {
      const mapped =
        mapServiceError(
          error
        );

      res
        .status(mapped.status)
        .json({
          success: false,
          message:
            mapped.message,
        });
    }
  };

export const updateSupportTicketController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    const adminId =
      getAdminId(
        req,
        res
      );

    if (!adminId) return;

    try {
      const ticketId =
        asString(
          req.params.id
        );

      const updated =
        await updateSupportTicket({
          ticketId,
          adminId,
          status:
            req.body
                ?.status !==
              undefined
              ? (asString(
                  req.body.status
                ) as SupportTicketStatus)
              : undefined,
          priority:
            req.body
                ?.priority !==
              undefined
              ? (asString(
                  req.body.priority
                ) as SupportTicketPriority)
              : undefined,
          category:
            req.body
                ?.category !==
              undefined
              ? (asString(
                  req.body.category
                ) as SupportTicketCategory)
              : undefined,
          assigneeAdminId:
            req.body
                ?.assigneeAdminId ===
              null
              ? null
              : req.body
                    ?.assigneeAdminId !==
                  undefined
                ? asString(
                    req.body
                      .assigneeAdminId
                  )
                : undefined,
          tags:
            req.body
              ?.tags,
        });

      if (!updated) {
        res.status(404).json({
          success: false,
          message:
            "Support ticket not found.",
        });
        return;
      }

      const detail =
        await getSupportTicketDetail(
          ticketId
        );

      res.status(200).json({
        success: true,
        message:
          "Support ticket updated.",
        ticket:
          detail,
      });
    } catch (error) {
      const mapped =
        mapServiceError(
          error
        );

      res
        .status(mapped.status)
        .json({
          success: false,
          message:
            mapped.message,
        });
    }
  };

const addMessage = async (
  req: AuthRequest,
  res: Response,
  visibility:
    | "public"
    | "internal"
): Promise<void> => {
  const adminId =
    getAdminId(
      req,
      res
    );

  if (!adminId) return;

  try {
    const ticketId =
      asString(
        req.params.id
      );

    const updated =
      await addAdminSupportMessage({
        ticketId,
        adminId,
        body:
          asString(
            req.body
              ?.body
          ),
        visibility,
      });

    if (!updated) {
      res.status(404).json({
        success: false,
        message:
          "Support ticket not found.",
      });
      return;
    }

    const detail =
      await getSupportTicketDetail(
        ticketId
      );

    res.status(201).json({
      success: true,
      message:
        visibility ===
        "public"
          ? "Reply sent."
          : "Internal note added.",
      ticket:
        detail,
    });
  } catch (error) {
    const mapped =
      mapServiceError(
        error
      );

    res
      .status(mapped.status)
      .json({
        success: false,
        message:
          mapped.message,
      });
  }
};

export const addSupportReplyController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    await addMessage(
      req,
      res,
      "public"
    );
  };

export const addSupportNoteController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    await addMessage(
      req,
      res,
      "internal"
    );
  };

export const escalateSupportTicketController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    const adminId =
      getAdminId(
        req,
        res
      );

    if (!adminId) return;

    const reason =
      asString(
        req.body
          ?.reason
      )
        .trim()
        .slice(
          0,
          500
        );

    if (!reason) {
      res.status(400).json({
        success: false,
        message:
          "Escalation reason is required.",
      });
      return;
    }

    try {
      const ticketId =
        asString(
          req.params.id
        );

      const updated =
        await escalateSupportTicket({
          ticketId,
          adminId,
          reason,
        });

      if (!updated) {
        res.status(404).json({
          success: false,
          message:
            "Support ticket not found.",
        });
        return;
      }

      const detail =
        await getSupportTicketDetail(
          ticketId
        );

      res.status(200).json({
        success: true,
        message:
          "Support ticket escalated.",
        ticket:
          detail,
      });
    } catch (error) {
      console.error(
        "ESCALATE SUPPORT ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to escalate support ticket.",
      });
    }
  };

export const resolveSupportTicketController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    const adminId =
      getAdminId(
        req,
        res
      );

    if (!adminId) return;

    try {
      const ticketId =
        asString(
          req.params.id
        );

      const updated =
        await resolveSupportTicket({
          ticketId,
          adminId,
          resolution:
            asString(
              req.body
                ?.resolution
            ),
        });

      if (!updated) {
        res.status(404).json({
          success: false,
          message:
            "Support ticket not found.",
        });
        return;
      }

      const detail =
        await getSupportTicketDetail(
          ticketId
        );

      res.status(200).json({
        success: true,
        message:
          "Support ticket resolved.",
        ticket:
          detail,
      });
    } catch (error) {
      const mapped =
        mapServiceError(
          error
        );

      res
        .status(mapped.status)
        .json({
          success: false,
          message:
            mapped.message,
        });
    }
  };

export const exportSupportTicketsController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const query =
        await buildSupportTicketQuery({
          search:
            asString(
              req.query.search
            ),
          status:
            asString(
              req.query.status
            ),
          priority:
            asString(
              req.query.priority
            ),
          category:
            asString(
              req.query.category
            ),
          sla:
            asString(
              req.query.sla
            ),
        });

      const result =
        await listSupportTickets({
          query,
          page: 1,
          limit: 5000,
        });

      const csvEscape = (
        value: unknown
      ) =>
        `"${String(
          value ??
            ""
        ).replace(
          /"/g,
          '""'
        )}"`;

      const rows = [
        [
          "Ticket",
          "Customer",
          "Email",
          "Subject",
          "Category",
          "Priority",
          "Status",
          "Assignee",
          "SLA",
          "Last Activity",
        ],
        ...result.tickets.map(
          (ticket) => [
            ticket.ticketNumber,
            ticket.customerName,
            ticket.customerEmail,
            ticket.subject,
            ticket.category,
            ticket.priority,
            ticket.status,
            ticket.assignee.name,
            ticket.slaBreached
              ? "Breached"
              : `${ticket.slaMinutes}m`,
            ticket.lastActivityAt,
          ]
        ),
      ];

      const csv =
        rows
          .map((row) =>
            row
              .map(
                csvEscape
              )
              .join(",")
          )
          .join("\n");

      res.setHeader(
        "Content-Type",
        "text/csv; charset=utf-8"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="support-tickets-${new Date()
          .toISOString()
          .slice(0, 10)}.csv"`
      );

      res.status(200).send(csv);
    } catch (error) {
      console.error(
        "EXPORT SUPPORT ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to export support tickets.",
      });
    }
  };

export const getSupportAdminsController =
  async (
    _req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      const admins =
        await User.find({
          role: "admin",
          accountStatus:
            "active",
        })
          .select("name")
          .sort({ name: 1 })
          .lean();

      res.status(200).json({
        success: true,
        admins:
          admins.map(
            (admin) => ({
              id:
                admin._id.toString(),
              name:
                admin.name,
            })
          ),
      });
    } catch {
      res.status(500).json({
        success: false,
        message:
          "Unable to load support administrators.",
      });
    }
  };
