import crypto from "node:crypto";

import {
  WebhookEndpoint,
  type WebhookEnvironment,
  type WebhookEventType,
} from "../models/WebhookEndpoint.js";

import {
  WebhookEvent,
} from "../models/WebhookEvent.js";

import {
  enqueueWebhookDelivery,
} from "./webhookQueue.js";

/* =========================================================
   PLATFORM WEBHOOK PRIVATE KEY
========================================================= */

const getPrivateKey =
  (): string => {
    const key =
      process.env.DAMO_WEBHOOK_PRIVATE_KEY;

    if (!key?.trim()) {
      throw new Error(
        "DAMO_WEBHOOK_PRIVATE_KEY is not configured."
      );
    }

    return key.replace(
      /\\n/g,
      "\n"
    );
  };

/* =========================================================
   EVENT ID
========================================================= */

const generateEventId =
  (): string => {
    return `evt_${crypto.randomUUID()}`;
  };

/* =========================================================
   CREATE ENDPOINT
========================================================= */

export const createWebhookEndpoint =
  async ({
    merchantId,
    url,
    environment,
    events,
    description,
  }: {
    merchantId: string;

    url: string;

    environment:
      WebhookEnvironment;

    events:
      WebhookEventType[];

    description?: string;
  }) => {
    const normalizedUrl =
      url.trim();

    if (!normalizedUrl) {
      throw new Error(
        "Webhook URL is required."
      );
    }

    try {
      const parsed =
        new URL(
          normalizedUrl
        );

      if (
        parsed.protocol !==
          "https:" &&
        process.env.NODE_ENV ===
          "production"
      ) {
        throw new Error(
          "Webhook URL must use HTTPS in production."
        );
      }
    } catch {
      throw new Error(
        "Invalid webhook URL."
      );
    }

    if (
      !events ||
      events.length === 0
    ) {
      throw new Error(
        "At least one webhook event must be selected."
      );
    }

    return WebhookEndpoint.create({
      merchantId,

      url:
        normalizedUrl,

      environment,

      events,

      enabled:
        true,

      description:
        description?.trim() ||
        undefined,
    });
  };

/* =========================================================
   LIST ENDPOINTS
========================================================= */

export const listWebhookEndpoints =
  async ({
    merchantId,
  }: {
    merchantId: string;
  }) => {
    return WebhookEndpoint.find({
      merchantId,
    })
      .sort({
        createdAt: -1,
      })
      .lean();
  };

/* =========================================================
   DELETE ENDPOINT
========================================================= */

export const deleteWebhookEndpoint =
  async ({
    merchantId,
    endpointId,
  }: {
    merchantId: string;

    endpointId: string;
  }) => {
    const result =
      await WebhookEndpoint.findOneAndUpdate(
        {
          _id:
            endpointId,

          merchantId,
        },
        {
          $set: {
            enabled:
              false,
          },
        },
        {
          new: true,
        }
      );

    if (!result) {
      throw new Error(
        "Webhook endpoint not found."
      );
    }

    return result;
  };

/* =========================================================
   CREATE PAYMENT WEBHOOK EVENTS
========================================================= */

export const createPaymentWebhookEvents =
  async ({
    payment,
    eventType,
  }: {
    payment: {
      paymentId: string;

      merchantId:
        string;

      mode:
        WebhookEnvironment;

      amount: unknown;

      currency: string;

      customerId?: unknown;

      orderId?: unknown;

      merchantReference?: unknown;

      status: string;

      provider: string;

      sourceType: string;

      createdAt?: Date;

      authorizedAt?: Date;

      capturedAt?: Date;

      completedAt?: Date;

      failedAt?: Date;

      cancelledAt?: Date;

      expiredAt?: Date;
    };

    eventType:
      WebhookEventType;
  }): Promise<void> => {
    const endpoints =
      await WebhookEndpoint.find({
        merchantId:
          payment.merchantId,

        environment:
          payment.mode,

        enabled:
          true,

        events:
          eventType,
      }).lean();

    if (
      endpoints.length === 0
    ) {
      return;
    }

    const payload = {
      id:
        generateEventId(),

      type:
        eventType,

      created:
        new Date().toISOString(),

      data: {
        payment: {
          id:
            payment.paymentId,

          status:
            payment.status,

          amount:
            payment.amount?.toString?.() ??
            String(
              payment.amount
            ),

          currency:
            payment.currency,

          merchantId:
            payment.merchantId,

          customerId:
            payment.customerId,

          orderId:
            payment.orderId,

          merchantReference:
            payment.merchantReference,

          provider:
            payment.provider,

          sourceType:
            payment.sourceType,

          createdAt:
            payment.createdAt,

          authorizedAt:
            payment.authorizedAt,

          capturedAt:
            payment.capturedAt,

          completedAt:
            payment.completedAt,

          failedAt:
            payment.failedAt,

          cancelledAt:
            payment.cancelledAt,

          expiredAt:
            payment.expiredAt,
        },
      },
    };

    for (
      const endpoint of endpoints
    ) {
      const eventId =
        payload.id;

      const event =
        await WebhookEvent.create({
          eventId,

          merchantId:
            endpoint.merchantId,

          endpointId:
            endpoint._id,

          type:
            eventType,

          environment:
            endpoint.environment,

          paymentId:
            payment.paymentId,

          payload,

          status:
            "pending",

          attempts:
            0,

          nextAttemptAt:
            new Date(),
        });

      await enqueueWebhookDelivery(
        event._id.toString()
      );
    }
  };

/* =========================================================
   SIGN WEBHOOK
========================================================= */

export const signWebhookPayload =
  ({
    timestamp,
    rawBody,
  }: {
    timestamp: string;

    rawBody: string;
  }): string => {
    const data =
      `${timestamp}.${rawBody}`;

    const signer =
      crypto.createSign(
        "RSA-SHA256"
      );

    signer.update(
      data,
      "utf8"
    );

    signer.end();

    return signer.sign(
      getPrivateKey(),
      "base64"
    );
  };

/* =========================================================
   DELIVER ONE EVENT
========================================================= */

export const deliverWebhookEvent =
  async (
    webhookEventId: string
  ): Promise<void> => {
    const event =
      await WebhookEvent.findById(
        webhookEventId
      );

    if (!event) {
      return;
    }

    if (
      event.status ===
        "delivered"
    ) {
      return;
    }

    const endpoint =
      await WebhookEndpoint.findOne({
        _id:
          event.endpointId,

        enabled:
          true,
      }).lean();

    if (!endpoint) {
      event.status =
        "failed";

      event.lastError =
        "Webhook endpoint is disabled or no longer exists.";

      await event.save();

      return;
    }

    const rawBody =
      JSON.stringify(
        event.payload
      );

    const timestamp =
      Math.floor(
        Date.now() / 1000
      ).toString();

    const signature =
      signWebhookPayload({
        timestamp,

        rawBody,
      });

    const attempt =
      event.attempts + 1;

    event.status =
      "processing";

    event.attempts =
      attempt;

    event.lastAttemptAt =
      new Date();

    await event.save();

    try {
      const response =
        await fetch(
          endpoint.url,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",

              "User-Agent":
                "DAMO-Webhooks/1.0",

              "X-DAMO-Event-Id":
                event.eventId,

              "X-DAMO-Event-Type":
                event.type,

              "X-DAMO-Timestamp":
                timestamp,

              "X-DAMO-Signature":
                signature,
            },

            body:
              rawBody,

            signal:
              AbortSignal.timeout(
                10000
              ),
          }
        );

      if (
        response.ok
      ) {
        event.status =
          "delivered";

        event.deliveredAt =
          new Date();

        event.nextAttemptAt =
          undefined;

        event.lastError =
          undefined;

        await event.save();

        await WebhookEndpoint.updateOne(
          {
            _id:
              endpoint._id,
          },
          {
            $set: {
              lastDeliveredAt:
                new Date(),
            },
          }
        );

        return;
      }

      const responseText =
        await response
          .text()
          .catch(
            () => ""
          );

      throw new Error(
        `Webhook endpoint returned HTTP ${response.status}${
          responseText
            ? `: ${responseText.slice(
                0,
                500
              )}`
            : "."
        }`
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Webhook delivery failed.";

      event.status =
        "failed";

      event.lastError =
        message;

      /*
       * Exponential retry:
       * 1m → 5m → 15m → 1h → 6h
       */
      const retryDelays = [
        60_000,

        5 * 60_000,

        15 * 60_000,

        60 * 60_000,

        6 * 60 * 60_000,
      ];

      const retryIndex =
        Math.min(
          attempt - 1,

          retryDelays.length - 1
        );

      event.nextAttemptAt =
        new Date(
          Date.now() +
            retryDelays[
              retryIndex
            ]
        );

      await event.save();

      if (
        attempt <=
        retryDelays.length
      ) {
        await enqueueWebhookDelivery(
          event._id.toString()
        );
      }
    }
  };