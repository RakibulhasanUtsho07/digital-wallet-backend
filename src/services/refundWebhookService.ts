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
   TYPES
========================================================= */

export type RefundWebhookEventType =
  Extract<
    WebhookEventType,
    | "refund.created"
    | "refund.completed"
    | "refund.failed"
  >;

export interface RefundWebhookPayload {
  refundId: string;

  paymentId: string;

  merchantId: string;

  customerId: string;

  mode:
    WebhookEnvironment;

  amount: string;

  currency: string;

  status: string;

  reason?: string;

  merchantReference?: string;

  ledgerEntryGroupId?: string;

  createdAt?: Date;

  completedAt?: Date;

  failedAt?: Date;
}

/* =========================================================
   CREATE REFUND WEBHOOK EVENTS
========================================================= */

export const createRefundWebhookEvents =
  async ({
    refund,
    eventType,
  }: {
    refund:
      RefundWebhookPayload;

    eventType:
      RefundWebhookEventType;
  }): Promise<void> => {
    const endpoints =
      await WebhookEndpoint.find({
        merchantId:
          refund.merchantId,

        environment:
          refund.mode,

        enabled:
          true,

        events:
          eventType,
      }).lean();

    if (
      endpoints.length ===
      0
    ) {
      return;
    }

    for (
      const endpoint of
        endpoints
    ) {
      /*
       * WebhookEvent.eventId is globally unique.
       * Therefore every delivery receives its own event ID.
       */
      const eventId =
        `evt_${crypto.randomUUID()}`;

      const payload = {
        id:
          eventId,

        type:
          eventType,

        created:
          new Date()
            .toISOString(),

        data: {
          refund: {
            id:
              refund.refundId,

            paymentId:
              refund.paymentId,

            status:
              refund.status,

            amount:
              refund.amount,

            currency:
              refund.currency,

            merchantId:
              refund.merchantId,

            customerId:
              refund.customerId,

            reason:
              refund.reason,

            merchantReference:
              refund.merchantReference,

            ledgerEntryGroupId:
              refund.ledgerEntryGroupId,

            createdAt:
              refund.createdAt,

            completedAt:
              refund.completedAt,

            failedAt:
              refund.failedAt,
          },
        },
      };

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

          /*
           * Existing WebhookEvent schema requires paymentId.
           */
          paymentId:
            refund.paymentId,

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