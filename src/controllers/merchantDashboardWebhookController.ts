import mongoose from "mongoose";

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
  WEBHOOK_EVENTS,
  type WebhookEnvironment,
  type WebhookEventType,
} from "../models/WebhookEndpoint.js";

import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  listWebhookEndpoints,
  listWebhookEvents,
  retryWebhookEvent,
  rotateWebhookEndpointSecret,
  WebhookServiceError,
} from "../services/webhookService.js";

/* =========================================================
   HELPERS
========================================================= */

function textValue(
  value: unknown
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function integerValue(
  value: unknown,
  fallback: number
): number {
  const parsed = Number(value);

  return Number.isInteger(parsed)
    ? parsed
    : fallback;
}

function environmentValue(
  value: unknown
): WebhookEnvironment {
  if (
    value === "test" ||
    value === "live"
  ) {
    return value;
  }

  throw new WebhookServiceError(
    "Webhook environment must be test or live.",
    400
  );
}

function isWebhookEvent(
  value: unknown
): value is WebhookEventType {
  return (
    typeof value === "string" &&
    (
      WEBHOOK_EVENTS as readonly string[]
    ).includes(value)
  );
}

function ownerIdFrom(
  req: Request
): string {
  const authReq = req as AuthRequest;
  const ownerId = authReq.user?._id;

  if (!ownerId) {
    throw new WebhookServiceError(
      "Authentication required.",
      401
    );
  }

  if (!mongoose.isValidObjectId(ownerId)) {
    throw new WebhookServiceError(
      "Invalid authenticated user ID.",
      400
    );
  }

  return String(ownerId);
}

async function merchantContext(
  req: Request,
  environment: WebhookEnvironment
): Promise<{
  merchantId: string;
  environment: WebhookEnvironment;
}> {
  const ownerId = ownerIdFrom(req);

  const merchant = await Merchant.findOne({
    ownerId: new mongoose.Types.ObjectId(ownerId),
  })
    .select(
      "_id status verificationStatus testEnabled liveEnabled"
    )
    .lean();

  if (!merchant) {
    throw new WebhookServiceError(
      "Merchant account not found.",
      404
    );
  }

  if (
    environment === "test" &&
    merchant.testEnabled !== true
  ) {
    throw new WebhookServiceError(
      "Test mode is disabled for this merchant.",
      403
    );
  }

  if (
    environment === "live" &&
    (
      merchant.status !== "active" ||
      merchant.verificationStatus !== "verified" ||
      merchant.liveEnabled !== true
    )
  ) {
    throw new WebhookServiceError(
      "Verified live merchant access is required.",
      403
    );
  }

  return {
    merchantId: merchant._id.toString(),
    environment,
  };
}

function sendError(
  res: Response,
  error: unknown,
  fallback: string
): void {
  const expected =
    error instanceof WebhookServiceError;

  res.status(
    expected
      ? error.statusCode
      : 500
  ).json({
    success: false,
    message: expected
      ? error.message
      : fallback,
  });
}

function endpointView(
  endpoint: {
    _id: unknown;
    url: string;
    environment: WebhookEnvironment;
    events: WebhookEventType[];
    enabled: boolean;
    description?: string;
    secretHint: string;
    secretVersion: number;
    secretRotatedAt?: Date;
    lastDeliveredAt?: Date;
    createdAt: Date;
    updatedAt: Date;
  }
) {
  return {
    id: String(endpoint._id),
    url: endpoint.url,
    environment: endpoint.environment,
    events: endpoint.events,
    enabled: endpoint.enabled,
    description: endpoint.description,
    secretHint: endpoint.secretHint,
    secretVersion: endpoint.secretVersion,
    secretRotatedAt: endpoint.secretRotatedAt,
    lastDeliveredAt: endpoint.lastDeliveredAt,
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
  };
}

/* =========================================================
   LIST ENDPOINTS

   GET /api/merchants/webhooks?environment=test
========================================================= */

export async function listMerchantDashboardWebhooksController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const environment = environmentValue(
      req.query.environment ?? "test"
    );

    const context = await merchantContext(
      req,
      environment
    );

    const endpoints = await listWebhookEndpoints({
      merchantId: context.merchantId,
      environment: context.environment,
    });

    res.status(200).json({
      success: true,
      environment,
      webhooks: endpoints.map(endpointView),
    });
  } catch (error) {
    console.error(
      "DASHBOARD LIST WEBHOOKS ERROR:",
      error
    );

    sendError(
      res,
      error,
      "Unable to load webhook endpoints."
    );
  }
}

/* =========================================================
   CREATE ENDPOINT

   POST /api/merchants/webhooks
========================================================= */

export async function createMerchantDashboardWebhookController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const environment = environmentValue(
      req.body?.environment
    );

    const context = await merchantContext(
      req,
      environment
    );

    const requestedEvents: unknown[] =
      Array.isArray(req.body?.events)
        ? req.body.events as unknown[]
        : [];

    if (
      requestedEvents.length === 0 ||
      requestedEvents.some(
        (event: unknown) =>
          !isWebhookEvent(event)
      )
    ) {
      throw new WebhookServiceError(
        "At least one valid webhook event is required.",
        400
      );
    }

    const events: WebhookEventType[] =
      Array.from(
        new Set(
          requestedEvents.filter(isWebhookEvent)
        )
      );

    const result = await createWebhookEndpoint({
      merchantId: context.merchantId,
      environment: context.environment,
      url: textValue(req.body?.url),
      events,
      description:
        textValue(req.body?.description) ||
        undefined,
    });

    res.status(201).json({
      success: true,
      message: "Webhook endpoint created successfully.",
      webhook: endpointView(result.endpoint),
      signingSecret: result.signingSecret,
      warning:
        "Store this signing secret securely. It will not be shown again.",
    });
  } catch (error) {
    console.error(
      "DASHBOARD CREATE WEBHOOK ERROR:",
      error
    );

    sendError(
      res,
      error,
      "Unable to create webhook endpoint."
    );
  }
}

/* =========================================================
   DISABLE ENDPOINT

   DELETE /api/merchants/webhooks/:endpointId
========================================================= */

export async function disableMerchantDashboardWebhookController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const environment = environmentValue(
      req.query.environment
    );

    const context = await merchantContext(
      req,
      environment
    );

    const endpoint = await deleteWebhookEndpoint({
      merchantId: context.merchantId,
      environment: context.environment,
      endpointId: textValue(req.params.endpointId),
    });

    res.status(200).json({
      success: true,
      message: "Webhook endpoint disabled successfully.",
      webhook: endpointView(endpoint),
    });
  } catch (error) {
    console.error(
      "DASHBOARD DISABLE WEBHOOK ERROR:",
      error
    );

    sendError(
      res,
      error,
      "Unable to disable webhook endpoint."
    );
  }
}

/* =========================================================
   ROTATE SECRET

   POST /api/merchants/webhooks/:endpointId/rotate-secret
========================================================= */

export async function rotateMerchantDashboardWebhookSecretController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const environment = environmentValue(
      req.body?.environment
    );

    const context = await merchantContext(
      req,
      environment
    );

    const result = await rotateWebhookEndpointSecret({
      merchantId: context.merchantId,
      environment: context.environment,
      endpointId: textValue(req.params.endpointId),
    });

    res.status(200).json({
      success: true,
      message: "Webhook signing secret rotated successfully.",
      webhook: endpointView(result.endpoint),
      signingSecret: result.signingSecret,
      warning:
        "Replace the previous secret now. This value will not be shown again.",
    });
  } catch (error) {
    console.error(
      "DASHBOARD ROTATE WEBHOOK SECRET ERROR:",
      error
    );

    sendError(
      res,
      error,
      "Unable to rotate webhook signing secret."
    );
  }
}

/* =========================================================
   LIST DELIVERY EVENTS

   GET /api/merchants/webhook-events
========================================================= */

export async function listMerchantDashboardWebhookEventsController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const environment = environmentValue(
      req.query.environment ?? "test"
    );

    const context = await merchantContext(
      req,
      environment
    );

    const result = await listWebhookEvents({
      merchantId: context.merchantId,
      environment: context.environment,
      status: textValue(req.query.status) || undefined,
      page: integerValue(req.query.page, 1),
      limit: integerValue(req.query.limit, 20),
    });

    res.status(200).json({
      success: true,
      environment,
      events: result.events.map((event) => ({
        id: event._id.toString(),
        eventId: event.eventId,
        endpointId: event.endpointId.toString(),
        type: event.type,
        environment: event.environment,
        paymentId: event.paymentId,
        payload: event.payload,
        status: event.status,
        attempts: event.attempts,
        lastAttemptAt: event.lastAttemptAt,
        nextAttemptAt: event.nextAttemptAt,
        deliveredAt: event.deliveredAt,
        lastResponseStatus: event.lastResponseStatus,
        lastError: event.lastError,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      })),
      pagination: result.pagination,
    });
  } catch (error) {
    console.error(
      "DASHBOARD LIST WEBHOOK EVENTS ERROR:",
      error
    );

    sendError(
      res,
      error,
      "Unable to load webhook delivery events."
    );
  }
}

/* =========================================================
   RETRY DELIVERY

   POST /api/merchants/webhook-events/:eventId/retry
========================================================= */

export async function retryMerchantDashboardWebhookEventController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const environment = environmentValue(
      req.body?.environment
    );

    const context = await merchantContext(
      req,
      environment
    );

    const event = await retryWebhookEvent({
      merchantId: context.merchantId,
      environment: context.environment,
      eventId: textValue(req.params.eventId),
    });

    res.status(200).json({
      success: true,
      message: "Webhook event queued for retry.",
      event: {
        eventId: event.eventId,
        status: event.status,
        attempts: event.attempts,
        nextAttemptAt: event.nextAttemptAt,
      },
    });
  } catch (error) {
    console.error(
      "DASHBOARD RETRY WEBHOOK EVENT ERROR:",
      error
    );

    sendError(
      res,
      error,
      "Unable to retry webhook delivery."
    );
  }
}
