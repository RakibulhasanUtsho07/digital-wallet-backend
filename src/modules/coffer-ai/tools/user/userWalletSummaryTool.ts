import mongoose from "mongoose";

import { Wallet } from "../../../../models/Wallet.js";
import { CofferAiError } from "../../errors/cofferAiError.js";
import type { AiToolDefinition } from "../aiToolRegistry.js";

export const userWalletSummaryTool: AiToolDefinition = {
  id: "user.wallet.summary",
  async execute({ actor }) {
    if (actor.actorType !== "user" || !actor.userId || !mongoose.isValidObjectId(actor.userId)) {
      throw new CofferAiError({
        code: "AI_USER_SCOPE_REQUIRED",
        message: "A personal account context is required.",
        statusCode: 403,
      });
    }

    const wallet = await Wallet.findOne({
      userId: new mongoose.Types.ObjectId(actor.userId),
    })
      .select("balance pendingBalance currency status createdAt updatedAt")
      .lean();

    if (!wallet) {
      return {
        toolId: "user.wallet.summary" as const,
        title: "Wallet summary",
        summary: "No wallet is currently linked to this account.",
        verification: "verified" as const,
        confidence: "high" as const,
        facts: [{ label: "Wallet linked", value: false }],
        sources: [
          {
            type: "wallet_record",
            label: "Owned wallet record",
            reference: actor.userId,
          },
        ],
        suggestedActions: [{ label: "Open wallet", href: "/dashboard/wallet" }],
        diagnosis: null,
      };
    }

    return {
      toolId: "user.wallet.summary" as const,
      title: "Wallet summary",
      summary: `Your ${wallet.currency} wallet is ${String(wallet.status).toLowerCase()} with a current balance of ${wallet.balance}.`,
      verification: "verified" as const,
      confidence: "high" as const,
      facts: [
        { label: "Balance", value: String(wallet.balance) },
        { label: "Pending balance", value: String(wallet.pendingBalance ?? 0) },
        { label: "Currency", value: wallet.currency },
        { label: "Status", value: wallet.status },
      ],
      sources: [
        {
          type: "wallet_record",
          label: "Owned wallet record",
          reference: String(wallet._id),
        },
      ],
      suggestedActions: [{ label: "Open wallet", href: "/dashboard/wallet" }],
      diagnosis: null,
      data: {
        status: wallet.status,
        currency: wallet.currency,
        balance: String(wallet.balance),
        pendingBalance: String(wallet.pendingBalance ?? 0),
      },
    };
  },
};
