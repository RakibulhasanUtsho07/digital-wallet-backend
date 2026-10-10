import mongoose from "mongoose";

import { SecurityEvent } from "../../../../models/SecurityEvent.js";
import { calculateSecurityScore } from "../../../../services/securityScoreService.js";
import { CofferAiError } from "../../errors/cofferAiError.js";
import type { AiToolDefinition } from "../aiToolRegistry.js";

export const userSecuritySummaryTool: AiToolDefinition = {
  id: "user.security.summary",

  async execute({ actor }) {
    if (
      actor.actorType !== "user" ||
      !actor.userId ||
      !mongoose.isValidObjectId(actor.userId)
    ) {
      throw new CofferAiError({
        code: "AI_USER_SCOPE_REQUIRED",
        message: "A personal account context is required.",
        statusCode: 403,
      });
    }

    const [score, recentEvents] = await Promise.all([
      calculateSecurityScore(actor.userId),
      SecurityEvent.find({
        userId: new mongoose.Types.ObjectId(actor.userId),
      })
        .select("eventType title status createdAt")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    const warningCount = recentEvents.filter(
      (event) => String(event.status) === "warning",
    ).length;

    const recentSummary = recentEvents.map((event) => ({
      eventType: String(event.eventType),
      title: String(event.title),
      status: String(event.status),
      createdAt: event.createdAt
        ? new Date(event.createdAt).toISOString()
        : null,
    }));

    return {
      toolId: "user.security.summary" as const,
      title: "Security summary",
      summary: `Your current security score is ${score.score}/100 with ${score.riskLevel.toLowerCase()} risk. ${warningCount} of the latest ${recentEvents.length} recorded security events are warnings.`,
      verification: "verified" as const,
      confidence: "high" as const,
      facts: [
        { label: "Security score", value: score.score },
        { label: "Risk level", value: score.riskLevel },
        { label: "Two-factor enabled", value: score.checklist.twoFactorEnabled },
        { label: "Email verified", value: score.checklist.emailVerified },
        { label: "KYC completed", value: score.checklist.kycCompleted },
        { label: "Strong password policy", value: score.checklist.strongPassword },
        { label: "Active sessions", value: score.metrics.activeSessions },
        { label: "Failed logins (30d)", value: score.metrics.failedLogins30d },
        { label: "Enabled security alerts", value: score.metrics.enabledAlerts },
        { label: "Wallet frozen", value: score.metrics.walletFrozen },
        {
          label: "Last security check",
          value: score.lastSecurityCheckAt
            ? score.lastSecurityCheckAt.toISOString()
            : null,
        },
      ],
      sources: [
        {
          type: "security_score",
          label: "Owned security score",
          reference: actor.userId,
        },
        ...recentEvents.map((event) => ({
          type: "security_event",
          label: "Owned security event",
          reference: String(event._id),
        })),
      ],
      suggestedActions: [
        {
          label: "Open Security Center",
          href: "/dashboard/security",
        },
      ],
      diagnosis: null,
      data: {
        kind: "user_security_summary",
        score: score.score,
        riskLevel: score.riskLevel,
        recentEvents: recentSummary,
      },
    };
  },
};
