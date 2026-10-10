import { getSupportDashboardAnalytics } from "../../../../services/supportAnalyticsDashboardService.js";
import { CofferAiError } from "../../errors/cofferAiError.js";
import type { AiToolDefinition } from "../aiToolRegistry.js";

export const supportOperationsTool: AiToolDefinition = {
  id: "support.operations.summary",
  async execute({ actor }) {
    if (actor.actorType !== "support") {
      throw new CofferAiError({
        code: "AI_SUPPORT_SCOPE_REQUIRED",
        message: "A Support Agent role is required.",
        statusCode: 403,
      });
    }

    const analytics = await getSupportDashboardAnalytics({ days: 30 });
    const summary = analytics.summary;

    return {
      toolId: "support.operations.summary" as const,
      title: "Support operations summary",
      summary: `The current 30-day support window has ${summary.openTickets} open tickets, ${summary.breachedTickets} SLA-breached tickets, ${summary.escalatedTickets} escalated tickets, and ${summary.urgentTickets} urgent tickets.`,
      verification: "verified" as const,
      confidence: "high" as const,
      facts: [
        { label: "Open tickets", value: summary.openTickets },
        { label: "Urgent tickets", value: summary.urgentTickets },
        { label: "Escalated", value: summary.escalatedTickets },
        { label: "SLA breached", value: summary.breachedTickets },
        { label: "Resolution rate", value: summary.resolutionRate },
        { label: "CSAT", value: summary.csat },
      ],
      sources: [
        {
          type: "support_analytics",
          label: "Support ticket analytics",
          reference: "30d",
        },
      ],
      suggestedActions: [
        {
          label: "Open support queue",
          href: "/dashboard/support-dashboard/tickets",
        },
      ],
      diagnosis: null,
      data: {
        period: analytics.period,
        summary,
      },
    };
  },
};
