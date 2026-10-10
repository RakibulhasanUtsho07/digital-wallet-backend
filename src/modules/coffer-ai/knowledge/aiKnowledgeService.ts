import {
  SupportKnowledgeBase,
} from "../../../models/SupportKnowledgeBase.js";
import { AiRoleKnowledge } from "../../../models/AiRoleKnowledge.js";
import { knowledgeAudienceForActor, knowledgeMatchesRoleAndIntent } from "../learning/aiKnowledgeLearningService.js";
import type {
  AiActorType, AiIntent, AiSourceReference,
} from "../types/cofferAi.types.js";

export interface AiKnowledgeSnippet {
  id: string;
  title: string;
  category: string;
  summary: string;
  excerpt: string;
  source: AiSourceReference;
}

export interface AiKnowledgeService {
  search(input: {
    message: string;
    limit: number;
    actorType: AiActorType;
    intent: AiIntent;
  }): Promise<ReadonlyArray<AiKnowledgeSnippet>>;
}

const STOP_WORDS =
  new Set([
    "the",
    "and",
    "for",
    "with",
    "this",
    "that",
    "from",
    "what",
    "why",
    "how",
    "when",
    "where",
    "payment",
    "transaction",
    "wallet",
    "customer",
    "user",
    "merchant",
    "support",
    "please",
    "check",
    "failed",
    "fail",
  ]);

function tokens(
  message: string,
): string[] {
  return Array.from(
    new Set(
      message
        .toLowerCase()
        .replace(
          /[^a-z0-9\u0980-\u09ff\s_-]/g,
          " ",
        )
        .split(/\s+/)
        .map(
          (value) =>
            value.trim(),
        )
        .filter(
          (value) =>
            value.length >= 3 &&
            !STOP_WORDS.has(
              value,
            ),
        ),
    ),
  ).slice(0, 8);
}

function excerpt(
  content: string,
): string {
  const normalized =
    content
      .replace(/\s+/g, " ")
      .trim();

  return normalized.length <= 700
    ? normalized
    : `${normalized.slice(0, 697)}...`;
}

export const mongoAiKnowledgeService:
  AiKnowledgeService = {
  async search(input) {
    const audienceRole = knowledgeAudienceForActor(input.actorType);
    if (!audienceRole || input.intent === "unknown") return [];
    const searchTokens =
      tokens(input.message);

    if (
      searchTokens.length === 0
    ) {
      return [];
    }

    const limit =
      Math.min(
        8,
        Math.max(
          1,
          input.limit,
        ),
      );

    const textQuery =
      searchTokens.join(" ");

    const roleFilter = {
      status: "published" as const,
      audienceRole,
      intent: input.intent,
    };
    let roleRows: Array<{
      _id: unknown;
      audienceRole: typeof audienceRole;
      intent: string;
      title: string;
      summary: string;
      content: string;
    }> = [];
    try {
      roleRows = await AiRoleKnowledge.find({ ...roleFilter, $text: { $search: textQuery } })
        .select("audienceRole intent title summary content")
        .limit(limit)
        .lean();
    } catch {
      const safeTokens = searchTokens.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      roleRows = await AiRoleKnowledge.find({
        ...roleFilter,
        $or: safeTokens.flatMap((value) => [
          { title: { $regex: value, $options: "i" } },
          { summary: { $regex: value, $options: "i" } },
          { content: { $regex: value, $options: "i" } },
        ]),
      }).select("audienceRole intent title summary content").limit(limit).lean();
    }

    const approved = roleRows
      .filter((row) => knowledgeMatchesRoleAndIntent({
        audienceRole: row.audienceRole,
        intent: row.intent,
        actorType: input.actorType,
        requestedIntent: input.intent,
      }))
      .map((row) => ({
        id: String(row._id),
        title: row.title,
        category: "Role guidance",
        summary: row.summary,
        excerpt: excerpt(row.content),
        source: { type: "reviewed_role_knowledge", label: row.title, reference: String(row._id) },
      }));

    // Existing Support KB articles remain available to Support only. They are
    // never reused as customer, merchant, analyst or administrator guidance.
    if (audienceRole !== "support" || approved.length >= limit) return approved;

    let rows:
      Array<{
        _id: unknown;
        title: string;
        slug: string;
        summary?: string;
        content: string;
        category: string;
      }> = [];

    try {
      rows =
        await SupportKnowledgeBase.find({
          status:
            "published",
          $text: {
            $search:
              textQuery,
          },
        })
          .select(
            "title slug summary content category",
          )
          .limit(limit - approved.length)
          .lean();
    } catch {
      const safeTokens =
        searchTokens.map(
          (value) =>
            value.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&",
            ),
        );

      rows =
        await SupportKnowledgeBase.find({
          status:
            "published",
          $or: safeTokens.flatMap(
            (value) => [
              {
                title: {
                  $regex: value,
                  $options: "i",
                },
              },
              {
                summary: {
                  $regex: value,
                  $options: "i",
                },
              },
              {
                content: {
                  $regex: value,
                  $options: "i",
                },
              },
            ],
          ),
        })
          .select(
            "title slug summary content category",
          )
          .limit(limit - approved.length)
          .lean();
    }

    return [...approved, ...rows.map(
      (row) => ({
        id:
          String(row._id),
        title:
          row.title,
        category:
          row.category,
        summary:
          row.summary ?? "",
        excerpt:
          excerpt(row.content),
        source: {
          type:
            "knowledge_base",
          label:
            row.title,
          reference:
            row.slug ||
            String(row._id),
        },
      }),
    )];
  },
};
