import type {
  Request,
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  Merchant,
} from "../models/Merchant.js";

import {
  MerchantApiKey,
} from "../models/MerchantApiKey.js";

import {
  askMerchantAi,
  type MerchantAiContext,
  type MerchantAiMessage,
} from "../services/merchantAiAssistantService.js";

/* =========================================================
   TYPES
========================================================= */

interface ChatBody {
  message?: unknown;

  history?: Array<{
    role?: unknown;
    content?: unknown;
  }>;
}

/* =========================================================
   LOAD SAFE MERCHANT CONTEXT
========================================================= */

async function loadContext(
  userId: string
): Promise<
  MerchantAiContext & {
    activeKeyCount: number;
  }
> {
  const merchant =
    await Merchant.findOne({
      ownerId:
        userId,
    })
      .select(
        [
          "_id",
          "businessName",
          "businessDisplayName",
          "status",
          "verificationStatus",
          "defaultCurrency",
          "testEnabled",
          "liveEnabled",
        ].join(
          " "
        )
      )
      .lean();

  if (
    !merchant
  ) {
    throw new Error(
      "Merchant account not found."
    );
  }

  const keys =
    await MerchantApiKey.find({
      merchantId:
        merchant._id,

      status:
        "active",
    })
      .select(
        [
          "environment",
          "keyPrefix",
          "scopes",
          "status",
          "name",
          "expiresAt",
          "lastUsedAt",
        ].join(
          " "
        )
      )
      .lean();

  const testKeys =
    keys.filter(
      (
        key
      ) =>
        key.environment ===
        "test"
    );

  const liveKeys =
    keys.filter(
      (
        key
      ) =>
        key.environment ===
        "live"
    );

  const uniqueScopes = (
    values:
      Array<
        string[] |
        undefined
      >
  ): string[] => {
    return [
      ...new Set(
        values.flatMap(
          (
            value
          ) =>
            Array.isArray(
              value
            )
              ? value
              : []
        )
      ),
    ].sort();
  };

  return {
    businessName:
      merchant.businessDisplayName ||
      merchant.businessName,

    merchantStatus:
      merchant.status,

    verificationStatus:
      merchant.verificationStatus,

    defaultCurrency:
      merchant.defaultCurrency ||
      "BDT",

    testEnabled:
      merchant.testEnabled ===
      true,

    liveEnabled:
      merchant.liveEnabled ===
      true,

    testKeyConfigured:
      testKeys.length >
      0,

    liveKeyConfigured:
      liveKeys.length >
      0,

    testScopes:
      uniqueScopes(
        testKeys.map(
          (
            key
          ) =>
            key.scopes
        )
      ),

    liveScopes:
      uniqueScopes(
        liveKeys.map(
          (
            key
          ) =>
            key.scopes
        )
      ),

    activeKeyCount:
      keys.length,
  };
}

/* =========================================================
   GET SAFE ASSISTANT CONTEXT
========================================================= */

export async function getMerchantAiContextController(
  req:
    AuthRequest,
  res:
    Response
): Promise<void> {
  try {
    const userId =
      req.user?._id;

    if (
      !userId
    ) {
      res.status(
        401
      ).json({
        success:
          false,

        message:
          "Authentication required.",
      });

      return;
    }

    const context =
      await loadContext(
        String(
          userId
        )
      );

    res.status(
      200
    ).json({
      success:
        true,

      context,
    });
  } catch (
    error
  ) {
    console.error(
      "MERCHANT ASSISTANT CONTEXT ERROR:",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : "Unable to load integration assistant context.";

    const status =
      message ===
      "Merchant account not found."
        ? 404
        : 500;

    res.status(
      status
    ).json({
      success:
        false,

      message,
    });
  }
}

/* =========================================================
   MERCHANT INTEGRATION ASSISTANT CHAT
========================================================= */

export async function merchantAiChatController(
  req:
    Request,
  res:
    Response
): Promise<void> {
  try {
    const authReq =
      req as
        AuthRequest;

    const userId =
      authReq.user?._id;

    if (
      !userId
    ) {
      res.status(
        401
      ).json({
        success:
          false,

        message:
          "Authentication required.",
      });

      return;
    }

    const body =
      req.body as
        ChatBody;

    const message =
      typeof body.message ===
      "string"
        ? body.message.trim()
        : "";

    if (
      !message
    ) {
      res.status(
        400
      ).json({
        success:
          false,

        message:
          "Message is required.",
      });

      return;
    }

    if (
      message.length >
      6000
    ) {
      res.status(
        400
      ).json({
        success:
          false,

        message:
          "Message is too long.",
      });

      return;
    }

    const history:
      MerchantAiMessage[] =
      Array.isArray(
        body.history
      )
        ? body.history
            .slice(
              -12
            )
            .filter(
              (
                item
              ) =>
                (
                  item.role ===
                    "user" ||
                  item.role ===
                    "assistant"
                ) &&
                typeof item.content ===
                  "string"
            )
            .map(
              (
                item
              ) => ({
                role:
                  item.role as
                    | "user"
                    | "assistant",

                content:
                  String(
                    item.content
                  ),
              })
            )
        : [];

    const context =
      await loadContext(
        String(
          userId
        )
      );

    const result =
      await askMerchantAi({
        message,
        history,
        context,
      });

    res.status(
      200
    ).json({
      success:
        true,

      answer:
        result.answer,

      /*
       * Not an external AI provider.
       */
      provider:
        "coffer",

      /*
       * Local deterministic
       * integration engine.
       */
      model:
        result.model,

      externalAi:
        false,
    });
  } catch (
    error
  ) {
    console.error(
      "MERCHANT INTEGRATION ASSISTANT ERROR:",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : "Unable to generate integration response.";

    res.status(
      500
    ).json({
      success:
        false,

      message,
    });
  }
}