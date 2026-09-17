import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  listSupportKnowledgeBase,
  getSupportKnowledgeBaseArticle,
  createSupportKnowledgeBaseArticle,
} from "../services/supportKnowledgeBaseService.js";

/* =========================================================
   LIST / SEARCH
   GET /api/v1/support/knowledge-base
========================================================= */

export const getSupportKnowledgeBaseController =
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
        await listSupportKnowledgeBase({
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
        "SUPPORT KNOWLEDGE BASE ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to load support knowledge base.",
      });
    }
  };

/* =========================================================
   GET ARTICLE
   GET /api/v1/support/knowledge-base/:id
========================================================= */

export const getSupportKnowledgeBaseArticleController =
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

      const articleId =
        typeof req.params.id ===
        "string"
          ? req.params.id
          : "";

      const article =
        await getSupportKnowledgeBaseArticle(
          articleId
        );

      if (
        !article
      ) {
        res.status(404).json({
          success: false,
          message:
            "Knowledge base article not found.",
        });

        return;
      }

      res.status(200).json({
        success: true,
        article,
      });
    } catch (
      error: unknown
    ) {
      console.error(
        "SUPPORT KNOWLEDGE BASE ARTICLE ERROR:",
        error instanceof Error
          ? error.message
          : error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to load knowledge base article.",
      });
    }
  };

/* =========================================================
   CREATE ARTICLE
   POST /api/v1/support/knowledge-base
========================================================= */

export const createSupportKnowledgeBaseArticleController =
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
        slug,
        summary,
        content,
        category,
        tags,
      } =
        req.body ?? {};

      if (
        typeof title !==
          "string" ||
        typeof slug !==
          "string" ||
        typeof content !==
          "string" ||
        typeof category !==
          "string"
      ) {
        res.status(400).json({
          success: false,
          message:
            "title, slug, content and category are required.",
        });

        return;
      }

      const article =
        await createSupportKnowledgeBaseArticle({
          title,
          slug,
          summary:
            typeof summary ===
            "string"
              ? summary
              : undefined,
          content,
          category,
          tags,
          adminId:
            req.user._id,
        });

      res.status(201).json({
        success: true,

        message:
          "Knowledge base article created successfully.",

        article: {
          id:
            article._id.toString(),

          title:
            article.title,

          slug:
            article.slug,

          category:
            article.category,

          status:
            article.status,
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
          "INVALID_KNOWLEDGE_BASE_CONTENT"
      ) {
        res.status(400).json({
          success: false,
          message:
            "Invalid knowledge base content.",
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
            "A knowledge base article with this slug already exists.",
        });

        return;
      }

      console.error(
        "CREATE SUPPORT KNOWLEDGE BASE ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to create knowledge base article.",
      });
    }
  };