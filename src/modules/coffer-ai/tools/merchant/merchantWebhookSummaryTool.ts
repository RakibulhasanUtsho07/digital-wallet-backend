import {
  listWebhookEndpoints,
  listWebhookEvents,
} from "../../../../services/webhookService.js";
import { CofferAiError } from "../../errors/cofferAiError.js";
import type { AiToolDefinition } from "../aiToolRegistry.js";

type Environment = "test" | "live";

type EndpointLike = {
  enabled?: unknown;
  lastDeliveredAt?: unknown;
};

type EventLike = {
  status?: unknown;
};

export const merchantWebhookSummaryTool: AiToolDefinition = {
  id: "merchant.webhooks.summary",

  async execute({ actor }) {
    if (actor.actorType !== "merchant" || !actor.merchantId) {
      throw new CofferAiError({
        code: "AI_MERCHANT_SCOPE_REQUIRED",
        message: "A merchant account context is required.",
        statusCode: 403,
      });
    }

    const environments: Environment[] = ["test", "live"];

    const results = await Promise.all(
      environments.map(async (environment) => {
        const [rawEndpoints, eventResult] = await Promise.all([
          listWebhookEndpoints({ merchantId: actor.merchantId!, environment }),
          listWebhookEvents({
            merchantId: actor.merchantId!,
            environment,
            page: 1,
            limit: 100,
          }),
        ]);

        const endpoints = rawEndpoints as unknown as EndpointLike[];
        const events = eventResult.events as unknown as EventLike[];
        const recent = {
          delivered: events.filter((event) => String(event.status ?? "") === "delivered").length,
          failed: events.filter((event) => String(event.status ?? "") === "failed").length,
          pending: events.filter((event) => String(event.status ?? "") === "pending").length,
          processing: events.filter((event) => String(event.status ?? "") === "processing").length,
        };

        return {
          environment,
          endpointCount: endpoints.length,
          enabledEndpointCount: endpoints.filter((endpoint) => endpoint.enabled === true).length,
          deliveryEventCount: eventResult.pagination.total,
          sampledDeliveryCount: events.length,
          recent,
        };
      }),
    );

    const totalEndpoints = results.reduce((sum, item) => sum + item.endpointCount, 0);
    const enabledEndpoints = results.reduce((sum, item) => sum + item.enabledEndpointCount, 0);
    const totalEvents = results.reduce((sum, item) => sum + item.deliveryEventCount, 0);
    const sampledFailed = results.reduce((sum, item) => sum + item.recent.failed, 0);

    const test = results.find((item) => item.environment === "test")!;
    const live = results.find((item) => item.environment === "live")!;

    return {
      toolId: "merchant.webhooks.summary" as const,
      title: "Merchant webhook delivery summary",
      summary:
        `${totalEndpoints} webhook endpoint${totalEndpoints === 1 ? " is" : "s are"} configured across Test and Live, ` +
        `with ${enabledEndpoints} enabled. ${totalEvents} delivery event${totalEvents === 1 ? " is" : "s are"} recorded.`,
      verification: "verified" as const,
      confidence: "high" as const,
      facts: [
        { label: "Webhook endpoints", value: totalEndpoints },
        { label: "Enabled endpoints", value: enabledEndpoints },
        { label: "Total delivery events", value: totalEvents },
        { label: "Recent sampled failures", value: sampledFailed },
        { label: "Test endpoints", value: test.endpointCount },
        { label: "Test delivery events", value: test.deliveryEventCount },
        { label: "Live endpoints", value: live.endpointCount },
        { label: "Live delivery events", value: live.deliveryEventCount },
      ],
      sources: [
        {
          type: "merchant_webhook_metadata",
          label: "Owned merchant webhook metadata",
          reference: actor.merchantId,
        },
      ],
      suggestedActions: [
        { label: "Open webhooks", href: "/dashboard/merchant/webhooks" },
      ],
      diagnosis: null,
      data: {
        kind: "merchant_webhook_summary",
        environments: results,
        secretAccess: false,
      },
    };
  },
};
