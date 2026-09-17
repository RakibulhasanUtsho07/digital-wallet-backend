import mongoose, {
  Schema,
  type Document,
  type Model,
} from "mongoose";

import type {
  EncryptedData,
} from "../utils/crypto.js";

/* =========================================================
   EVENTS
========================================================= */

export const WEBHOOK_EVENTS = [
  "payment.created",
  "payment.authorized",
  "payment.captured",
  "payment.completed",
  "payment.failed",
  "payment.cancelled",
  "payment.expired",
] as const;

export type WebhookEventType =
  (typeof WEBHOOK_EVENTS)[number];

export type WebhookEnvironment =
  | "test"
  | "live";

/* =========================================================
   INTERFACE
========================================================= */

export interface IWebhookEndpoint
  extends Document {
  merchantId:
    mongoose.Types.ObjectId;

  url: string;

  environment:
    WebhookEnvironment;

  events:
    WebhookEventType[];

  enabled: boolean;

  description?: string;

  /*
   * Per-endpoint HMAC signing secret.
   * Plaintext is never stored.
   */
  signingSecretEncrypted:
    EncryptedData;

  /*
   * Safe identifier shown on dashboard.
   * Example: ••••••aB12xY
   */
  secretHint: string;

  secretVersion: number;

  secretRotatedAt?: Date;

  lastDeliveredAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

/* =========================================================
   ENCRYPTED SECRET SCHEMA
========================================================= */

const encryptedSecretSchema =
  new Schema<EncryptedData>(
    {
      encrypted: {
        type: String,
        required: true,
      },

      iv: {
        type: String,
        required: true,
      },

      authTag: {
        type: String,
        required: true,
      },
    },
    {
      _id: false,
    }
  );

/* =========================================================
   SCHEMA
========================================================= */

const webhookEndpointSchema =
  new Schema<IWebhookEndpoint>(
    {
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

      url: {
        type:
          String,

        required:
          true,

        trim:
          true,

        maxlength:
          2048,
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

      events: {
        type: [
          {
            type:
              String,

            enum:
              WEBHOOK_EVENTS,
          },
        ],

        required:
          true,

        default:
          [],
      },

      enabled: {
        type:
          Boolean,

        required:
          true,

        default:
          true,

        index:
          true,
      },

      description: {
        type:
          String,

        trim:
          true,

        maxlength:
          500,

        default:
          undefined,
      },

      signingSecretEncrypted: {
        type:
          encryptedSecretSchema,

        required:
          true,

        /*
         * Never expose encrypted secret through
         * normal database queries.
         */
        select:
          false,
      },

      secretHint: {
        type:
          String,

        required:
          true,

        trim:
          true,

        maxlength:
          30,
      },

      secretVersion: {
        type:
          Number,

        required:
          true,

        default:
          1,

        min:
          1,
      },

      secretRotatedAt: {
        type:
          Date,

        default:
          undefined,
      },

      lastDeliveredAt: {
        type:
          Date,

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

webhookEndpointSchema.index(
  {
    merchantId:
      1,

    environment:
      1,

    enabled:
      1,
  },
  {
    name:
      "webhook_endpoint_merchant_environment",
  }
);

webhookEndpointSchema.index(
  {
    merchantId:
      1,

    environment:
      1,

    url:
      1,
  },
  {
    name:
      "webhook_endpoint_url_lookup",
  }
);

/* =========================================================
   MODEL
========================================================= */

const WebhookEndpointModel:
  Model<IWebhookEndpoint> =
  (
    mongoose.models
      .WebhookEndpoint as
      Model<IWebhookEndpoint> |
      undefined
  ) ??
  mongoose.model<IWebhookEndpoint>(
    "WebhookEndpoint",
    webhookEndpointSchema
  );

export const WebhookEndpoint =
  WebhookEndpointModel;

export default WebhookEndpointModel;