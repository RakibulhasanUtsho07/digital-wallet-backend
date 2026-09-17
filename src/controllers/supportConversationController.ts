import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  getSupportConversations,
  getSupportConversation,
} from "../services/supportConversationService.js";

/* =========================================================
   CONVERSATION LIST
   GET /api/v1/support/conversations
========================================================= */

export const getSupportConversationsController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      if (
        !req.user?._id
      ) {
        res.status(401).json({
          success: false,
          message:
            "Authentication required.",
        });

        return;
      }

      const search =
        typeof req.query.search ===
        "string"
          ? req.query.search
          : undefined;

      const status =
        typeof req.query.status ===
        "string"
          ? req.query.status
          : undefined;

      const page =
        Number(
          req.query.page ?? 1
        );

      const limit =
        Number(
          req.query.limit ?? 20
        );

      const result =
        await getSupportConversations({
          search,
          status,
          page:
            Number.isFinite(
              page
            )
              ? page
              : 1,
          limit:
            Number.isFinite(
              limit
            )
              ? limit
              : 20,
        });

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "SUPPORT CONVERSATIONS ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to load support conversations.",
      });
    }
  };

/* =========================================================
   SINGLE CONVERSATION
   GET /api/v1/support/conversations/:id
========================================================= */

export const getSupportConversationController =
  async (
    req: AuthRequest,
    res: Response
  ): Promise<void> => {
    try {
      if (
        !req.user?._id
      ) {
        res.status(401).json({
          success: false,
          message:
            "Authentication required.",
        });

        return;
      }

      const ticketId =
        typeof req.params.id ===
        "string"
          ? req.params.id
          : "";

      const conversation =
        await getSupportConversation(
          ticketId
        );

      if (
        !conversation
      ) {
        res.status(404).json({
          success: false,
          message:
            "Support conversation not found.",
        });

        return;
      }

      res.status(200).json({
        success: true,
        conversation,
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "SUPPORT CONVERSATION DETAIL ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to load support conversation.",
      });
    }
  };