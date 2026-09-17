import mongoose from "mongoose";

import {
  SupportSavedReply,
} from "../models/SupportSavedReply.js";

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
   LIST / SEARCH SAVED REPLIES
========================================================= */

export const listSupportSavedReplies =
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
          shortcut: {
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
      replies,
      total,
    ] =
      await Promise.all([
        SupportSavedReply.find(
          query
        )
          .select(
            "title shortcut content category tags status createdAt updatedAt"
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

        SupportSavedReply.countDocuments(
          query
        ),
      ]);

    return {
      replies:
        replies.map(
          (
            reply
          ) => ({
            id:
              reply._id.toString(),

            title:
              reply.title,

            shortcut:
              reply.shortcut,

            content:
              reply.content,

            category:
              reply.category,

            tags:
              reply.tags ??
              [],

            status:
              reply.status,

            createdAt:
              new Date(
                reply.createdAt
              ).toISOString(),

            updatedAt:
              new Date(
                reply.updatedAt
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
   GET SAVED REPLY
========================================================= */

export const getSupportSavedReply =
  async (
    replyId: string
  ) => {
    if (
      !mongoose.Types.ObjectId.isValid(
        replyId
      )
    ) {
      return null;
    }

    const reply =
      await SupportSavedReply.findOne({
        _id:
          replyId,

        status:
          "published",
      })
        .lean();

    if (
      !reply
    ) {
      return null;
    }

    return {
      id:
        reply._id.toString(),

      title:
        reply.title,

      shortcut:
        reply.shortcut,

      content:
        reply.content,

      category:
        reply.category,

      tags:
        reply.tags ??
        [],

      status:
        reply.status,

      createdAt:
        new Date(
          reply.createdAt
        ).toISOString(),

      updatedAt:
        new Date(
          reply.updatedAt
        ).toISOString(),
    };
  };

/* =========================================================
   CREATE SAVED REPLY
---------------------------------------------------------
Admin/Super Admin managed content.
========================================================= */

export const createSupportSavedReply =
  async ({
    title,
    shortcut,
    content,
    category,
    tags,
    adminId,
  }: {
    title: string;
    shortcut: string;
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
          140
        );

    const cleanShortcut =
      shortcut
        .trim()
        .toLowerCase()
        .replace(
          /\s+/g,
          "-"
        )
        .replace(
          /[^a-z0-9_-]/g,
          ""
        )
        .slice(
          0,
          80
        );

    const cleanContent =
      content
        .trim()
        .slice(
          0,
          4000
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
      cleanShortcut.length < 2 ||
      cleanContent.length < 3 ||
      cleanCategory.length < 2
    ) {
      throw new Error(
        "INVALID_SAVED_REPLY_CONTENT"
      );
    }

    const reply =
      await SupportSavedReply.create({
        title:
          cleanTitle,

        shortcut:
          cleanShortcut,

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

    return reply;
  };