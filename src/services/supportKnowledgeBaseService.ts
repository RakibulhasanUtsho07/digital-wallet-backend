import mongoose from "mongoose";

import {
  SupportKnowledgeBase,
} from "../models/SupportKnowledgeBase.js";

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
   NORMALIZE TAGS
========================================================= */

const normalizeTags = (
  value: unknown
): string[] => {
  if (
    !Array.isArray(value)
  ) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter(
          (
            item
          ): item is string =>
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
    20
  );
};

/* =========================================================
   SEARCH / LIST
========================================================= */

export const listSupportKnowledgeBase =
  async ({
    search,
    category,
    page = 1,
    limit = 20,
  }: {
    search?: string;
    category?: string;
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
      status:
        "published",
    };

    /* =====================================================
       CATEGORY
    ====================================================== */

    const cleanCategory =
      category
        ?.trim()
        .slice(
          0,
          100
        );

    if (
      cleanCategory
    ) {
      query.category = {
        $regex:
          `^${escapeRegex(
            cleanCategory
          )}$`,
        $options:
          "i",
      };
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
          title: {
            $regex:
              escapeRegex(
                cleanSearch
              ),
            $options:
              "i",
          },
        },
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
          content: {
            $regex:
              escapeRegex(
                cleanSearch
              ),
            $options:
              "i",
          },
        },
        {
          tags: {
            $elemMatch: {
              $regex:
                escapeRegex(
                  cleanSearch
                ),
              $options:
                "i",
            },
          },
        },
      ];
    }

    const [
      articles,
      total,
    ] =
      await Promise.all([
        SupportKnowledgeBase.find(
          query
        )
          .select(
            "title slug summary category tags status updatedAt createdAt"
          )
          .sort({
            updatedAt:
              -1,
          })
          .skip(
            skip
          )
          .limit(
            safeLimit
          )
          .lean(),

        SupportKnowledgeBase.countDocuments(
          query
        ),
      ]);

    return {
      articles:
        articles.map(
          (
            article
          ) => ({
            id:
              article._id.toString(),

            title:
              article.title,

            slug:
              article.slug,

            summary:
              article.summary ??
              "",

            category:
              article.category,

            tags:
              article.tags ??
              [],

            status:
              article.status,

            updatedAt:
              new Date(
                article.updatedAt
              ).toISOString(),

            createdAt:
              new Date(
                article.createdAt
              ).toISOString(),
          })
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
   GET ARTICLE
========================================================= */

export const getSupportKnowledgeBaseArticle =
  async (
    articleId: string
  ) => {
    if (
      !mongoose.Types.ObjectId.isValid(
        articleId
      )
    ) {
      return null;
    }

    const article =
      await SupportKnowledgeBase.findOne({
        _id:
          articleId,

        status:
          "published",
      })
        .lean();

    if (
      !article
    ) {
      return null;
    }

    return {
      id:
        article._id.toString(),

      title:
        article.title,

      slug:
        article.slug,

      summary:
        article.summary ??
        "",

      content:
        article.content,

      category:
        article.category,

      tags:
        article.tags ??
        [],

      status:
        article.status,

      createdAt:
        new Date(
          article.createdAt
        ).toISOString(),

      updatedAt:
        new Date(
          article.updatedAt
        ).toISOString(),
    };
  };

/* =========================================================
   CREATE ARTICLE
---------------------------------------------------------
Admin/Super Admin use this endpoint.
========================================================= */

export const createSupportKnowledgeBaseArticle =
  async ({
    title,
    slug,
    summary,
    content,
    category,
    tags,
    adminId,
  }: {
    title: string;
    slug: string;
    summary?: string;
    content: string;
    category: string;
    tags?: string[];
    adminId: string;
  }) => {
    const cleanTitle =
      title
        .trim()
        .slice(
          0,
          180
        );

    const cleanSlug =
      slug
        .trim()
        .toLowerCase()
        .replace(
          /[^a-z0-9]+/g,
          "-"
        )
        .replace(
          /^-+|-+$/g,
          ""
        )
        .slice(
          0,
          220
        );

    const cleanSummary =
      summary
        ?.trim()
        .slice(
          0,
          400
        );

    const cleanContent =
      content
        .trim()
        .slice(
          0,
          12000
        );

    const cleanCategory =
      category
        .trim()
        .slice(
          0,
          100
        );

    if (
      cleanTitle.length < 3 ||
      cleanSlug.length < 3 ||
      cleanContent.length < 3 ||
      cleanCategory.length < 2
    ) {
      throw new Error(
        "INVALID_KNOWLEDGE_BASE_CONTENT"
      );
    }

    const article =
      await SupportKnowledgeBase.create({
        title:
          cleanTitle,

        slug:
          cleanSlug,

        summary:
          cleanSummary ||
          undefined,

        content:
          cleanContent,

        category:
          cleanCategory,

        tags:
          normalizeTags(
            tags
          ),

        status:
          "published",

        createdByAdminId:
          adminId,

        updatedByAdminId:
          adminId,
      });

    return article;
  };