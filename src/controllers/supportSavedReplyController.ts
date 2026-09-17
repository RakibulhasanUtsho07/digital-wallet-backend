import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  listSupportSavedReplies,
  getSupportSavedReply,
  createSupportSavedReply,
} from "../services/supportSavedReplyService.js";

/* =========================================================
   LIST / SEARCH
   GET /api/v1/support/saved-replies
========================================================= */

export const getSupportSavedRepliesController =
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

      const category =
        typeof req.query.category ===
        "string"
          ? req.query.category
          : undefined;

      const page =
        Number(
          req.query.page ??
            1
        );

      const limit =
        Number(
          req.query.limit ??
            20
        );

      const result =
        await listSupportSavedReplies({
          search,
          category,
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
        "SUPPORT SAVED REPLIES ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(500).json({
        success: false,

        message:
          "Failed to load saved replies.",
      });
    }
  };

/* =========================================================
   GET SINGLE REPLY
   GET /api/v1/support/saved-replies/:id
========================================================= */

export const getSupportSavedReplyController =
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

      const replyId =
        typeof req.params.id ===
        "string"
          ? req.params.id
          : "";

      const reply =
        await getSupportSavedReply(
          replyId
        );

      if (
        !reply
      ) {
        res.status(404).json({
          success: false,

          message:
            "Saved reply not found.",
        });

        return;
      }

      res.status(200).json({
        success: true,
        reply,
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "SUPPORT SAVED REPLY DETAIL ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(500).json({
        success: false,

        message:
          "Failed to load saved reply.",
      });
    }
  };

/* =========================================================
   CREATE
   POST /api/v1/support/saved-replies
========================================================= */

export const createSupportSavedReplyController =
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

      const {
        title,
        shortcut,
        content,
        category,
        tags,
      } =
        req.body ?? {};

      if (
        typeof title !==
          "string" ||
        typeof shortcut !==
          "string" ||
        typeof content !==
          "string" ||
        typeof category !==
          "string"
      ) {
        res.status(400).json({
          success: false,

          message:
            "title, shortcut, content and category are required.",
        });

        return;
      }

      const reply =
        await createSupportSavedReply({
          title,
          shortcut,
          content,
          category,
          tags,
          adminId:
            req.user._id,
        });

      res.status(201).json({
        success: true,

        message:
          "Saved reply created successfully.",

        reply: {
          id:
            reply._id.toString(),

          title:
            reply.title,

          shortcut:
            reply.shortcut,

          category:
            reply.category,

          status:
            reply.status,
        },
      });
    } catch (
      error: unknown
    ) {
      const message =
        error instanceof Error
          ? error.message
          : "";

      if (
        message ===
        "INVALID_SAVED_REPLY_CONTENT"
      ) {
        res.status(400).json({
          success: false,

          message:
            "Invalid saved reply content.",
        });

        return;
      }

      if (
        (
          error as {
            code?: number;
          }
        )?.code === 11000
      ) {
        res.status(409).json({
          success: false,

          message:
            "A saved reply with this shortcut already exists.",
        });

        return;
      }

      console.error(
        "CREATE SUPPORT SAVED REPLY ERROR:",
        error
      );

      res.status(500).json({
        success: false,

        message:
          "Failed to create saved reply.",
      });
    }
  };