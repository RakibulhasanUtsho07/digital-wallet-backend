import mongoose, {
  Schema,
  type Document,
  type Model,
} from "mongoose";

import {
  WEBHOOK_EVENTS,
  type WebhookEnvironment,
  type WebhookEventType,
} from "./WebhookEndpoint.js";

/* =========================================================
   TYPES
========================================================= */

export type WebhookEventStatus =
  | "pending"
  | "processing"
  | "delivered"
  | "failed";

/* =========================================================
   INTERFACE
========================================================= */

export interface IWebhookEvent
  extends Document {
  eventId: string;

  merchantId:
    mongoose.Types.ObjectId;

  endpointId:
    mongoose.Types.ObjectId;

  type:
    WebhookEventType;

  environment:
    WebhookEnvironment;

  paymentId: string;

  payload:
    Record<string, unknown>;

  status:
    WebhookEventStatus;

  attempts: number;

  processingStartedAt?: Date;

  lastAttemptAt?: Date;

  nextAttemptAt?: Date;

  deliveredAt?: Date;

  lastResponseStatus?: number;

  lastError?: string;

  createdAt: Date;
  updatedAt: Date;
}

/* =========================================================
   SCHEMA
========================================================= */

const webhookEventSchema =
  new Schema<IWebhookEvent>(
    {
      eventId: {
        type:
          String,

        required:
          true,

        trim:
          true,

        maxlength:
          150,
      },

      merchantId: {
        type:
          Schema.Types.ObjectId,

        ref:
          "Merchant",

        required:
          true,

        index:
          true,
      },

      endpointId: {
        type:
          Schema.Types.ObjectId,

        ref:
          "WebhookEndpoint",

        required:
          true,

        index:
          true,
      },

      type: {
        type:
          String,

        enum:
          WEBHOOK_EVENTS,

        required:
          true,

        index:
          true,
      },

      environment: {
        type:
          String,

        enum: [
          "test",
          "live",
        ],

        required:
          true,

        index:
          true,
      },

      paymentId: {
        type:
          String,

        required:
          true,

        trim:
          true,

        index:
          true,
      },

      payload: {
        type:
          Schema.Types.Mixed,

        required:
          true,
      },

      status: {
        type:
          String,

        enum: [
          "pending",
          "processing",
          "delivered",
          "failed",
        ],

        required:
          true,

        default:
          "pending",

        index:
          true,
      },

      attempts: {
        type:
          Number,

        required:
          true,

        default:
          0,

        min:
          0,
      },

      processingStartedAt: {
        type:
          Date,

        default:
          undefined,
      },

      lastAttemptAt: {
        type:
          Date,

        default:
          undefined,
      },

      nextAttemptAt: {
        type:
          Date,

        default:
          undefined,

        index:
          true,
      },

      deliveredAt: {
        type:
          Date,

        default:
          undefined,
      },

      lastResponseStatus: {
        type:
          Number,

        min:
          100,

        max:
          599,

        default:
          undefined,
      },

      lastError: {
        type:
          String,

        maxlength:
          2000,

        default:
          undefined,
      },
    },
    {
      timestamps:
        true,

      versionKey:
        false,

      strict:
        true,
    }
  );

/* =========================================================
   INDEXES
========================================================= */

webhookEventSchema.index(
  {
    eventId:
      1,
  },
  {
    unique:
      true,

    name:
      "unique_webhook_event_id",
  }
);

webhookEventSchema.index(
  {
    merchantId:
      1,

    environment:
      1,

    createdAt:
      -1,
  },
  {
    name:
      "merchant_webhook_history",
  }
);

webhookEventSchema.index(
  {
    status:
      1,

    nextAttemptAt:
      1,

    attempts:
      1,
  },
  {
    name:
      "webhook_retry_lookup",
  }
);

webhookEventSchema.index(
  {
    merchantId:
      1,

    paymentId:
      1,

    type:
      1,
  },
  {
    name:
      "payment_webhook_lookup",
  }
);

/* =========================================================
   MODEL
========================================================= */

const WebhookEventModel:
  Model<IWebhookEvent> =
  (
    mongoose.models
      .WebhookEvent as
      Model<IWebhookEvent> |
      undefined
  ) ??
  mongoose.model<IWebhookEvent>(
    "WebhookEvent",
    webhookEventSchema
  );

export const WebhookEvent =
  WebhookEventModel;

export default WebhookEventModel;