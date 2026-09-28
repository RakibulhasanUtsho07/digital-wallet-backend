import {
  listWebhookEndpoints,
  listWebhookEvents,
} from "../../../../services/webhookService.js";
import { CofferAiError } from "../../errors/cofferAiError.js";
import type {
  AiDiagnosisCause,
  AiToolResult,
} from "../../types/cofferAi.types.js";
import type { AiToolDefinition } from "../aiToolRegistry.js";

type Environment = "test" | "live";

type EventLike = {
  eventId?: unknown;
  endpointId?: unknown;
  type?: unknown;
  environment?: unknown;
  paymentId?: unknown;
  status?: unknown;
  attempts?: unknown;
  lastResponseStatus?: unknown;
  lastError?: unknown;
  lastAttemptAt?: unknown;
  nextAttemptAt?: unknown;
  deliveredAt?: unknown;
  createdAt?: unknown;
};

type EndpointLike = {
  _id?: unknown;
  enabled?: unknown;
  events?: unknown;
  environment?: unknown;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function id(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (
    typeof value === "object" &&
    value !== null &&
    "toString" in value &&
    typeof value.toString === "function"
  ) {
    return value.toString().trim();
  }
  return String(value).trim();
}

function numberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function iso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function safeFailure(event: EventLike): {
  cause?: AiDiagnosisCause;
  category: string | null;
} {
  const statusCode = numberValue(event.lastResponseStatus);
  const error = text(event.lastError);
  const lower = error.toLowerCase();

  if (statusCode !== null && statusCode >= 400) {
    return {
      cause: {
        code: `merchant_http_${statusCode}`,
        label: `Coffer reached the webhook destination, but the merchant endpoint returned HTTP ${statusCode}.`,
        evidenceRefs: ["webhook.status", "webhook.lastResponseStatus"],
      },
      category: `HTTP ${statusCode}`,
    };
  }

  if (/timed out|timeout/.test(lower)) {
    return {
      cause: {
        code: "webhook_delivery_timeout",
        label: "The webhook delivery timed out before a successful response was received.",
        evidenceRefs: ["webhook.status", "webhook.lastError"],
      },
      category: "delivery timeout",
    };
  }

  if (/disabled|no longer exists|missing|secret rotation/.test(lower)) {
    return {
      cause: {
        code: "webhook_endpoint_unavailable",
        label: "The recorded delivery error indicates that the webhook endpoint was unavailable or disabled.",
        evidenceRefs: ["webhook.status", "webhook.lastError"],
      },
      category: "endpoint unavailable",
    };
  }

  if (/hostname|resolve|destination is not allowed|url/.test(lower)) {
    return {
      cause: {
        code: "webhook_destination_error",
        label: "The recorded delivery error indicates a webhook destination or hostname problem.",
        evidenceRefs: ["webhook.status", "webhook.lastError"],
      },
      category: "destination error",
    };
  }

  if (error) {
    return {
      cause: {
        code: "recorded_webhook_delivery_error",
        label: "A webhook delivery error is recorded, but its raw response text is intentionally not exposed through AI.",
        evidenceRefs: ["webhook.status", "webhook.lastError"],
      },
      category: "recorded delivery error",
    };
  }

  return {
    category: null,
  };
}

async function findOwnedEvent(
  merchantId: string,
  eventId: string,
): Promise<{ event: EventLike; environment: Environment } | null> {
  const environments: Environment[] = ["test", "live"];

  for (const environment of environments) {
    const first = await listWebhookEvents({
      merchantId,
      environment,
      page: 1,
      limit: 100,
    });

    const firstMatch = (first.events as unknown as EventLike[]).find(
      (event) => id(event.eventId) === eventId,
    );

    if (firstMatch) return { event: firstMatch, environment };

    const pages = Math.min(
      Math.max(Number(first.pagination.totalPages ?? 1), 1),
      10,
    );

    for (let page = 2; page <= pages; page += 1) {
      const batch = await listWebhookEvents({
        merchantId,
        environment,
        page,
        limit: 100,
      });

      const match = (batch.events as unknown as EventLike[]).find(
        (event) => id(event.eventId) === eventId,
      );

      if (match) return { event: match, environment };
    }
  }

  return null;
}

export const merchantWebhookDiagnosisTool: AiToolDefinition = {
  id: "merchant.webhook.diagnosis",

  async execute({ actor, payload }): Promise<AiToolResult> {
    if (actor.actorType !== "merchant" || !actor.merchantId) {
      throw new CofferAiError({
        code: "AI_MERCHANT_SCOPE_REQUIRED",
        message: "A merchant account context is required.",
        statusCode: 403,
      });
    }

    const eventId = text(payload.resourceId);

    if (!eventId) {
      throw new CofferAiError({
        code: "AI_WEBHOOK_EVENT_ID_REQUIRED",
        message: "Please provide the webhook event ID you want me to diagnose.",
        statusCode: 400,
      });
    }

    const found = await findOwnedEvent(actor.merchantId, eventId);

    if (!found) {
      throw new CofferAiError({
        code: "AI_WEBHOOK_EVENT_NOT_FOUND",
        message:
          "That webhook event was not found in the recent Test or Live delivery history for this merchant account.",
        statusCode: 404,
      });
    }

    const event = found.event;
    const status = text(event.status) || "unknown";
    const endpointId = id(event.endpointId);
    const failure = safeFailure(event);

    const endpoints = (await listWebhookEndpoints({
      merchantId: actor.merchantId,
      environment: found.environment,
    })) as unknown as EndpointLike[];

    const endpoint = endpoints.find(
      (item) => id(item._id) === endpointId,
    );

    const endpointEnabled = endpoint?.enabled === true;
    const subscriptions = Array.isArray(endpoint?.events)
      ? endpoint!.events!.filter((item): item is string => typeof item === "string")
      : [];

    const exactCause =
      status === "failed" ? failure.cause : undefined;

    const stateIsNonFailure =
      status === "delivered" ||
      status === "pending" ||
      status === "processing";

    const summary =
      status === "failed"
        ? exactCause
          ? `Verified state: Webhook event ${eventId} is failed.\nVerified cause: ${exactCause.label}`
          : `Verified state: Webhook event ${eventId} is failed.\nDiagnosis: The exact delivery failure is not recorded and cannot be verified.`
        : status === "delivered"
          ? `Verified state: Webhook event ${eventId} was delivered successfully.\nDiagnosis: No current delivery failure is recorded.`
          : status === "processing"
            ? `Verified state: Webhook event ${eventId} is processing.\nDiagnosis: No final delivery failure is recorded yet.`
            : status === "pending"
              ? `Verified state: Webhook event ${eventId} is pending.\nDiagnosis: Delivery has not reached a final failed or delivered state yet.`
              : `Verified state: Webhook event ${eventId} is ${status}.\nDiagnosis: The exact delivery cause cannot be verified from the recorded fields.`;

    return {
      toolId: "merchant.webhook.diagnosis",
      title: "Merchant webhook delivery diagnosis",
      summary,
      verification:
        Boolean(exactCause) || stateIsNonFailure ? "verified" : "partial",
      confidence:
        Boolean(exactCause) || stateIsNonFailure ? "high" : "medium",
      facts: [
        { label: "Webhook event ID", value: eventId },
        { label: "Environment", value: found.environment },
        { label: "Event type", value: text(event.type) || null },
        { label: "Status", value: status },
        { label: "Attempts", value: numberValue(event.attempts) },
        {
          label: "Last HTTP response",
          value: numberValue(event.lastResponseStatus),
        },
        { label: "Failure category", value: failure.category },
        { label: "Endpoint enabled", value: endpoint ? endpointEnabled : null },
        {
          label: "Endpoint subscribed to event",
          value:
            endpoint && text(event.type)
              ? subscriptions.includes(text(event.type))
              : null,
        },
        { label: "Payment ID", value: text(event.paymentId) || null },
        { label: "Last attempt", value: iso(event.lastAttemptAt) },
        { label: "Next attempt", value: iso(event.nextAttemptAt) },
        { label: "Delivered at", value: iso(event.deliveredAt) },
        { label: "Created at", value: iso(event.createdAt) },
      ],
      sources: [
        {
          type: "merchant_webhook_event",
          label: "Owned merchant webhook delivery event",
          reference: eventId,
        },
        ...(endpointId
          ? [
              {
                type: "merchant_webhook_endpoint",
                label: "Owned merchant webhook endpoint metadata",
                reference: endpointId,
              },
            ]
          : []),
      ],
      suggestedActions: [
        {
          label: "Open merchant webhooks",
          href: "/dashboard/merchant/webhooks",
        },
      ],
      diagnosis: {
        subjectType: "webhook",
        subjectId: eventId,
        state: status,
        exactCause,
        possibleCauses: [],
        nextSteps: [
          {
            label:
              status === "failed"
                ? "Review the endpoint and delivery event before manually retrying from the Webhooks page"
                : "Review the webhook delivery state in the Webhooks page",
            href: "/dashboard/merchant/webhooks",
          },
        ],
        verified: Boolean(exactCause) || stateIsNonFailure,
      },
      data: {
        kind: "merchant_webhook_diagnosis",
        event: {
          eventId,
          environment: found.environment,
          eventType: text(event.type) || null,
          status,
          attempts: numberValue(event.attempts),
          lastResponseStatus: numberValue(event.lastResponseStatus),
          failureCategory: failure.category,
          endpointEnabled: endpoint ? endpointEnabled : null,
          paymentId: text(event.paymentId) || null,
          lastAttemptAt: iso(event.lastAttemptAt),
          nextAttemptAt: iso(event.nextAttemptAt),
          deliveredAt: iso(event.deliveredAt),
          createdAt: iso(event.createdAt),
          secretAccess: false,
        },
      },
    };
  },
};
