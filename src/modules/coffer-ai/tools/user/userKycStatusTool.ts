import mongoose from "mongoose";

import { KYC } from "../../../../models/KYC.js";
import { CofferAiError } from "../../errors/cofferAiError.js";
import type { AiToolDefinition } from "../aiToolRegistry.js";

export const userKycStatusTool: AiToolDefinition = {
  id: "user.kyc.status",
  async execute({ actor }) {
    if (actor.actorType !== "user" || !actor.userId || !mongoose.isValidObjectId(actor.userId)) {
      throw new CofferAiError({
        code: "AI_USER_SCOPE_REQUIRED",
        message: "A personal account context is required.",
        statusCode: 403,
      });
    }

    const kyc = await KYC.findOne({
      userId: new mongoose.Types.ObjectId(actor.userId),
    })
      .select("status provider rejectionReason submittedAt verifiedAt updatedAt")
      .lean();

    const status = String(kyc?.status ?? actor.kycState ?? "not_started");
    const facts: Array<{ label: string; value: string | number | boolean | null }> = [
      { label: "KYC status", value: status },
      { label: "Provider", value: kyc?.provider ? String(kyc.provider) : null },
      { label: "Submitted at", value: kyc?.submittedAt ? new Date(kyc.submittedAt).toISOString() : null },
      { label: "Verified at", value: kyc?.verifiedAt ? new Date(kyc.verifiedAt).toISOString() : null },
    ];

    if (status === "rejected" && kyc?.rejectionReason) {
      facts.push({
        label: "Rejection reason",
        value: String(kyc.rejectionReason).slice(0, 500),
      });
    }

    return {
      toolId: "user.kyc.status" as const,
      title: "KYC status",
      summary: `Your KYC status is ${status}.`,
      verification: "verified" as const,
      confidence: "high" as const,
      facts,
      sources: [
        {
          type: "kyc_record",
          label: "Owned KYC record",
          reference: kyc ? String(kyc._id) : actor.userId,
        },
      ],
      suggestedActions: [{ label: "Open KYC", href: "/dashboard/kyc" }],
      diagnosis: null,
      data: { status },
    };
  },
};
