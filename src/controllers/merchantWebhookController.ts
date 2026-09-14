import type {
  Response,
} from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";

import {
  WEBHOOK_EVENTS,
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
   REQUEST TYPE
========================================================= */

interface MerchantRequest
  extends AuthRequest {
  merchant?: {
    _id: string;

    ownerId: string;

    businessName: string;

    slug: string;

    status: string;

    verificationStatus: string;

    defaultCurrency: string;

    environment:
      | "test"
      | "live";

    apiKeyId: string;
  };
}

/* =========================================================
   HELPERS
========================================================= */

function stringValue(
  value: unknown
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function numberValue(
  value: unknown,
  fallback: number
): number {
  const parsed =
    Number(
      value
    );

  return Number.isInteger(
    parsed
  )
    ? parsed
    : fallback;
}

function isWebhookEvent(
  value: unknown
): value is WebhookEventType {
  return (
    typeof value ===
      "string" &&
    (
      WEBHOOK_EVENTS as
        readonly string[]
    ).includes(
      value
    )
  );
}

function sendError(
  res: Response,
  error: unknown,
  fallbackMessage: string
): void {
  const expected =
    error instanceof
    WebhookServiceError;

  res.status(
    expected
      ? error.statusCode
      : 500
  ).json({
    success:
      false,

    message:
      expected
        ? error.message
        : fallbackMessage,
  });
}

/* =========================================================
   CREATE ENDPOINT
========================================================= */

export async function createMerchantWebhookEndpointController(
  req: MerchantRequest,
  res: Response
): Promise<void> {
  try {
    const merchant =
      req.merchant;

    if (!merchant?._id) {
      res.status(
        401
      ).json({
        success:
          false,

        message:
          "Merchant authentication required.",
      });

      return;
    }

    const requestedEvents:
      unknown[] =
      Array.isArray(
        req.body?.events
      )
        ? req.body.events as unknown[]
        : [];

    if (
      requestedEvents.length ===
        0 ||
      requestedEvents.some(
        (
          event: unknown
        ) =>
          !isWebhookEvent(
            event
          )
      )
    ) {
      res.status(
        400
      ).json({
        success:
          false,

        message:
          "At least one valid webhook event is required.",
      });

      return;
    }

    const events:
      WebhookEventType[] =
      Array.from(
        new Set(
          requestedEvents.filter(
            isWebhookEvent
          )
        )
      );

    const result =
      await createWebhookEndpoint({
        merchantId:
          merchant._id,

        url:
          stringValue(
            req.body?.url
          ),

        environment:
          merchant.environment,

        events,

        description:
          stringValue(
            req.body
              ?.description
          ) ||
          undefined,
      });

    const endpoint =
      result.endpoint;

    res.status(
      201
    ).json({
      success:
        true,

      message:
        "Webhook endpoint created successfully.",

      webhook: {
        id:
          endpoint._id.toString(),

        url:
          endpoint.url,

        environment:
          endpoint.environment,

        events:
          endpoint.events,

        enabled:
          endpoint.enabled,

        description:
          endpoint.description,

        secretHint:
          endpoint.secretHint,

        secretVersion:
          endpoint.secretVersion,

        createdAt:
          endpoint.createdAt,
      },

      /*
       * Show this once only.
       */
      signingSecret:
        result.signingSecret,

      warning:
        "Store this signing secret securely. It will not be shown again.",
    });
  } catch (
    error
  ) {
    console.error(
      "CREATE WEBHOOK ENDPOINT ERROR:",
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
   LIST ENDPOINTS
========================================================= */

export async function listMerchantWebhookEndpointsController(
  req: MerchantRequest,
  res: Response
): Promise<void> {
  try {
    const merchant =
      req.merchant;

    if (!merchant?._id) {
      res.status(
        401
      ).json({
        success:
          false,

        message:
          "Merchant authentication required.",
      });

      return;
    }

    const endpoints =
      await listWebhookEndpoints({
        merchantId:
          merchant._id,

        environment:
          merchant.environment,
      });

    res.status(
      200
    ).json({
      success:
        true,

      webhooks:
        endpoints.map(
          (
            endpoint
          ) => ({
            id:
              endpoint._id.toString(),

            url:
              endpoint.url,

            environment:
              endpoint.environment,

            events:
              endpoint.events,

            enabled:
              endpoint.enabled,

            description:
              endpoint.description,

            secretHint:
              endpoint.secretHint,

            secretVersion:
              endpoint.secretVersion,

            secretRotatedAt:
              endpoint.secretRotatedAt,

            lastDeliveredAt:
              endpoint.lastDeliveredAt,

            createdAt:
              endpoint.createdAt,

            updatedAt:
              endpoint.updatedAt,
          })
        ),
    });
  } catch (
    error
  ) {
    console.error(
      "LIST WEBHOOK ENDPOINTS ERROR:",
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
   DISABLE ENDPOINT
========================================================= */

export async function deleteMerchantWebhookEndpointController(
  req: MerchantRequest,
  res: Response
): Promise<void> {
  try {
    const merchant =
      req.merchant;

    if (!merchant?._id) {
      res.status(
        401
      ).json({
        success:
          false,

        message:
          "Merchant authentication required.",
      });

      return;
    }

    const endpoint =
      await deleteWebhookEndpoint({
        merchantId:
          merchant._id,

        environment:
          merchant.environment,

        endpointId:
          stringValue(
            req.params.id
          ),
      });

    res.status(
      200
    ).json({
      success:
        true,

      message:
        "Webhook endpoint disabled successfully.",

      webhook: {
        id:
          endpoint._id.toString(),

        enabled:
          endpoint.enabled,
      },
    });
  } catch (
    error
  ) {
    console.error(
      "DELETE WEBHOOK ENDPOINT ERROR:",
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
========================================================= */

export async function rotateMerchantWebhookSecretController(
  req: MerchantRequest,
  res: Response
): Promise<void> {
  try {
    const merchant =
      req.merchant;

    if (!merchant?._id) {
      res.status(
        401
      ).json({
        success:
          false,

        message:
          "Merchant authentication required.",
      });

      return;
    }

    const result =
      await rotateWebhookEndpointSecret({
        merchantId:
          merchant._id,

        environment:
          merchant.environment,

        endpointId:
          stringValue(
            req.params.id
          ),
      });

    res.status(
      200
    ).json({
      success:
        true,

      message:
        "Webhook signing secret rotated successfully.",

      webhook: {
        id:
          result.endpoint
            ._id
            .toString(),

        secretHint:
          result.endpoint
            .secretHint,

        secretVersion:
          result.endpoint
            .secretVersion,

        secretRotatedAt:
          result.endpoint
            .secretRotatedAt,
      },

      signingSecret:
        result.signingSecret,

      warning:
        "Replace the old signing secret immediately. This value will not be shown again.",
    });
  } catch (
    error
  ) {
    console.error(
      "ROTATE WEBHOOK SECRET ERROR:",
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
========================================================= */

export async function listMerchantWebhookEventsController(
  req: MerchantRequest,
  res: Response
): Promise<void> {
  try {
    const merchant =
      req.merchant;

    if (!merchant?._id) {
      res.status(
        401
      ).json({
        success:
          false,

        message:
          "Merchant authentication required.",
      });

      return;
    }

    const result =
      await listWebhookEvents({
        merchantId:
          merchant._id,

        environment:
          merchant.environment,

        status:
          stringValue(
            req.query.status
          ) ||
          undefined,

        page:
          numberValue(
            req.query.page,
            1
          ),

        limit:
          numberValue(
            req.query.limit,
            20
          ),
      });

    res.status(
      200
    ).json({
      success:
        true,

      events:
        result.events.map(
          (
            event
          ) => ({
            id:
              event._id.toString(),

            eventId:
              event.eventId,

            endpointId:
              event.endpointId.toString(),

            type:
              event.type,

            environment:
              event.environment,

            paymentId:
              event.paymentId,

            payload:
              event.payload,

            status:
              event.status,

            attempts:
              event.attempts,

            lastAttemptAt:
              event.lastAttemptAt,

            nextAttemptAt:
              event.nextAttemptAt,

            deliveredAt:
              event.deliveredAt,

            lastResponseStatus:
              event.lastResponseStatus,

            lastError:
              event.lastError,

            createdAt:
              event.createdAt,

            updatedAt:
              event.updatedAt,
          })
        ),

      pagination:
        result.pagination,
    });
  } catch (
    error
  ) {
    console.error(
      "LIST WEBHOOK EVENTS ERROR:",
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
   MANUAL RETRY
========================================================= */

export async function retryMerchantWebhookEventController(
  req: MerchantRequest,
  res: Response
): Promise<void> {
  try {
    const merchant =
      req.merchant;

    if (!merchant?._id) {
      res.status(
        401
      ).json({
        success:
          false,

        message:
          "Merchant authentication required.",
      });

      return;
    }

    const event =
      await retryWebhookEvent({
        merchantId:
          merchant._id,

        environment:
          merchant.environment,

        eventId:
          stringValue(
            req.params.eventId
          ),
      });

    res.status(
      200
    ).json({
      success:
        true,

      message:
        "Webhook event queued for retry.",

      event: {
        eventId:
          event.eventId,

        status:
          event.status,

        attempts:
          event.attempts,

        nextAttemptAt:
          event.nextAttemptAt,
      },
    });
  } catch (
    error
  ) {
    console.error(
      "RETRY WEBHOOK EVENT ERROR:",
      error
    );

    sendError(
      res,
      error,
      "Unable to retry webhook event."
    );
  }
}
