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

const stringValue = (
  value: unknown
): string => {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
};

const isWebhookEvent =
  (
    value: unknown
  ): value is WebhookEventType => {
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
  };

/* =========================================================
   CREATE ENDPOINT
 *
 * POST /api/v1/webhooks/endpoints
========================================================= */

export const createMerchantWebhookEndpointController =
  async (
    req: MerchantRequest,
    res: Response
  ): Promise<void> => {
    try {
      const merchant =
        req.merchant;

      if (!merchant?._id) {
        res.status(401).json({
          success: false,

          message:
            "Merchant authentication required.",
        });

        return;
      }

      const url =
        stringValue(
          req.body?.url
        );

      const description =
        stringValue(
          req.body?.description
        );

      const requestedEvents =
        Array.isArray(
          req.body?.events
        )
          ? req.body.events
          : [];

      const events =
        requestedEvents.filter(
          (
            value: unknown
          ): value is WebhookEventType =>
            isWebhookEvent(
              value
            )
        );

      if (
        !url
      ) {
        res.status(400).json({
          success: false,

          message:
            "Webhook URL is required.",
        });

        return;
      }

      if (
        events.length === 0
      ) {
        res.status(400).json({
          success: false,

          message:
            "At least one valid webhook event is required.",
        });

        return;
      }

      const endpoint =
        await createWebhookEndpoint({
          merchantId:
            merchant._id,

          url,

          environment:
            merchant.environment,

          events,

          description:
            description ||
            undefined,
        });

      res.status(201).json({
        success: true,

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

          createdAt:
            endpoint.createdAt,
        },
      });
    } catch (error) {
      console.error(
        "CREATE WEBHOOK ENDPOINT ERROR:",
        error
      );

      res.status(400).json({
        success: false,

        message:
          error instanceof Error
            ? error.message
            : "Unable to create webhook endpoint.",
      });
    }
  };

/* =========================================================
   LIST ENDPOINTS
 *
 * GET /api/v1/webhooks
========================================================= */

export const listMerchantWebhookEndpointsController =
  async (
    req: MerchantRequest,
    res: Response
  ): Promise<void> => {
    try {
      const merchant =
        req.merchant;

      if (!merchant?._id) {
        res.status(401).json({
          success: false,

          message:
            "Merchant authentication required.",
        });

        return;
      }

      const endpoints =
        await listWebhookEndpoints({
          merchantId:
            merchant._id,
        });

      res.status(200).json({
        success: true,

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

              lastDeliveredAt:
                endpoint.lastDeliveredAt,

              createdAt:
                endpoint.createdAt,
            })
          ),
      });
    } catch (error) {
      console.error(
        "LIST WEBHOOK ENDPOINTS ERROR:",
        error
      );

      res.status(400).json({
        success: false,

        message:
          "Unable to load webhook endpoints.",
      });
    }
  };

/* =========================================================
   DELETE ENDPOINT
 *
 * DELETE /api/v1/webhooks/:id
========================================================= */

export const deleteMerchantWebhookEndpointController =
  async (
    req: MerchantRequest,
    res: Response
  ): Promise<void> => {
    try {
      const merchant =
        req.merchant;

      if (!merchant?._id) {
        res.status(401).json({
          success: false,

          message:
            "Merchant authentication required.",
        });

        return;
      }

      const endpointId =
        stringValue(
          req.params.id
        );

      if (
        !endpointId
      ) {
        res.status(400).json({
          success: false,

          message:
            "Webhook endpoint ID is required.",
        });

        return;
      }

      const endpoint =
        await deleteWebhookEndpoint({
          merchantId:
            merchant._id,

          endpointId,
        });

      res.status(200).json({
        success: true,

        message:
          "Webhook endpoint disabled successfully.",

        webhook: {
          id:
            endpoint._id.toString(),

          enabled:
            endpoint.enabled,
        },
      });
    } catch (error) {
      console.error(
        "DELETE WEBHOOK ENDPOINT ERROR:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : "Unable to delete webhook endpoint.";

      res.status(
        message ===
          "Webhook endpoint not found."
          ? 404
          : 400
      ).json({
        success: false,

        message,
      });
    }
  };