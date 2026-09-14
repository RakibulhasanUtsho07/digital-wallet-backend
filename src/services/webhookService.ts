import crypto from "node:crypto";

import {
  lookup,
} from "node:dns/promises";

import {
  isIP,
} from "node:net";

import mongoose from "mongoose";

import {
  WebhookEndpoint,
  WEBHOOK_EVENTS,
  type WebhookEnvironment,
  type WebhookEventType,
} from "../models/WebhookEndpoint.js";

import {
  WebhookEvent,
  type WebhookEventStatus,
} from "../models/WebhookEvent.js";

import {
  createWebhookSignature,
  decryptData,
  encryptData,
  generateWebhookSigningSecret,
} from "../utils/crypto.js";

import {
  enqueueWebhookDelivery,
  MAX_WEBHOOK_ATTEMPTS,
} from "./webhookQueue.js";

/* =========================================================
   ERRORS
========================================================= */

export class WebhookServiceError
  extends Error {
  constructor(
    message: string,
    readonly statusCode:
      number
  ) {
    super(message);

    this.name =
      "WebhookServiceError";
  }
}

/* =========================================================
   TYPES
========================================================= */

interface PaymentWebhookInput {
  paymentId: string;

  merchantId: string;

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
}

/* =========================================================
   HELPERS
========================================================= */

function normalizeText(
  value: unknown
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function requireMerchantId(
  merchantId: string
): mongoose.Types.ObjectId {
  const normalized =
    normalizeText(
      merchantId
    );

  if (
    !mongoose.isValidObjectId(
      normalized
    )
  ) {
    throw new WebhookServiceError(
      "Invalid merchant ID.",
      400
    );
  }

  return new mongoose.Types.ObjectId(
    normalized
  );
}

function requireEndpointId(
  endpointId: string
): mongoose.Types.ObjectId {
  const normalized =
    normalizeText(
      endpointId
    );

  if (
    !mongoose.isValidObjectId(
      normalized
    )
  ) {
    throw new WebhookServiceError(
      "Invalid webhook endpoint ID.",
      400
    );
  }

  return new mongoose.Types.ObjectId(
    normalized
  );
}

function optionalId(
  value: unknown
): string | undefined {
  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  if (
    typeof value ===
    "string"
  ) {
    return (
      value.trim() ||
      undefined
    );
  }

  if (
    typeof value ===
    "object" &&
    "toString" in value &&
    typeof value.toString ===
      "function"
  ) {
    const normalized =
      value
        .toString()
        .trim();

    return (
      normalized ||
      undefined
    );
  }

  return undefined;
}

function moneyString(
  value: unknown
): string {
  if (
    value !== null &&
    value !== undefined &&
    typeof value ===
      "object" &&
    "toString" in value &&
    typeof value.toString ===
      "function"
  ) {
    return value.toString();
  }

  return String(
    value ?? ""
  );
}

function generateEventId():
  string {
  return `evt_${crypto.randomUUID()}`;
}

function webhookSecretHint(
  secret: string
): string {
  return `••••••${secret.slice(
    -6
  )}`;
}

function retryDelay(
  attempt: number
): number {
  return (
    60_000 *
    2 **
      Math.max(
        attempt - 1,
        0
      )
  );
}

function deliveryTimeout():
  number {
  const configured =
    Number(
      process.env
        .WEBHOOK_DELIVERY_TIMEOUT_MS
    );

  if (
    !Number.isFinite(
      configured
    )
  ) {
    return 10_000;
  }

  return Math.min(
    Math.max(
      Math.floor(
        configured
      ),
      1_000
    ),
    30_000
  );
}

/* =========================================================
   SSRF PROTECTION
========================================================= */

function isPrivateIpv4(
  address: string
): boolean {
  const parts =
    address
      .split(".")
      .map(Number);

  if (
    parts.length !==
      4 ||
    parts.some(
      (
        part
      ) =>
        !Number.isInteger(
          part
        ) ||
        part < 0 ||
        part > 255
    )
  ) {
    return true;
  }

  const [
    first,
    second,
  ] = parts;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (
      first === 100 &&
      second >= 64 &&
      second <= 127
    ) ||
    (
      first === 169 &&
      second === 254
    ) ||
    (
      first === 172 &&
      second >= 16 &&
      second <= 31
    ) ||
    (
      first === 192 &&
      second === 168
    ) ||
    (
      first === 198 &&
      (
        second === 18 ||
        second === 19
      )
    ) ||
    first >= 224
  );
}

function isPrivateAddress(
  rawAddress: string
): boolean {
  const address =
    rawAddress
      .trim()
      .toLowerCase()
      .replace(
        /^\[/,
        ""
      )
      .replace(
        /\]$/,
        ""
      );

  const family =
    isIP(
      address
    );

  if (family === 4) {
    return isPrivateIpv4(
      address
    );
  }

  if (family === 6) {
    return (
      address === "::" ||
      address === "::1" ||
      address.startsWith(
        "fc"
      ) ||
      address.startsWith(
        "fd"
      ) ||
      /^fe[89ab]/.test(
        address
      ) ||
      address.startsWith(
        "::ffff:"
      )
    );
  }

  return false;
}

async function normalizeWebhookUrl(
  rawUrl: string
): Promise<string> {
  const normalized =
    normalizeText(
      rawUrl
    );

  if (
    !normalized ||
    normalized.length >
      2048
  ) {
    throw new WebhookServiceError(
      "A valid webhook URL is required.",
      400
    );
  }

  let parsed:
    URL;

  try {
    parsed =
      new URL(
        normalized
      );
  } catch {
    throw new WebhookServiceError(
      "Webhook URL is invalid.",
      400
    );
  }

  if (
    ![
      "http:",
      "https:",
    ].includes(
      parsed.protocol
    )
  ) {
    throw new WebhookServiceError(
      "Webhook URL must use HTTP or HTTPS.",
      400
    );
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.hash
  ) {
    throw new WebhookServiceError(
      "Webhook URL cannot contain credentials or a fragment.",
      400
    );
  }

  const production =
    process.env.NODE_ENV ===
    "production";

  if (
    production &&
    parsed.protocol !==
      "https:"
  ) {
    throw new WebhookServiceError(
      "Webhook URL must use HTTPS in production.",
      400
    );
  }

  if (!production) {
    return parsed.toString();
  }

  const hostname =
    parsed.hostname
      .replace(
        /^\[/,
        ""
      )
      .replace(
        /\]$/,
        ""
      );

  if (
    hostname ===
      "localhost" ||
    hostname.endsWith(
      ".localhost"
    ) ||
    isPrivateAddress(
      hostname
    )
  ) {
    throw new WebhookServiceError(
      "Private or local webhook destinations are not allowed.",
      400
    );
  }

  let addresses:
    Array<{
      address: string;
      family: number;
    }>;

  try {
    addresses =
      await lookup(
        hostname,
        {
          all:
            true,

          verbatim:
            true,
        }
      );
  } catch {
    throw new WebhookServiceError(
      "Webhook hostname could not be resolved.",
      400
    );
  }

  if (
    !Array.isArray(
      addresses
    ) ||
    addresses.length ===
      0 ||
    addresses.some(
      (
        result
      ) =>
        isPrivateAddress(
          result.address
        )
    )
  ) {
    throw new WebhookServiceError(
      "Webhook destination is not allowed.",
      400
    );
  }

  return parsed.toString();
}

/* =========================================================
   CREATE ENDPOINT
========================================================= */

export async function createWebhookEndpoint({
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
}) {
  const merchantObjectId =
    requireMerchantId(
      merchantId
    );

  const normalizedUrl =
    await normalizeWebhookUrl(
      url
    );

  const normalizedEvents =
    Array.from(
      new Set(
        events.filter(
          (
            event
          ) =>
            (
              WEBHOOK_EVENTS as
                readonly string[]
            ).includes(
              event
            )
        )
      )
    );

  if (
    normalizedEvents.length ===
    0
  ) {
    throw new WebhookServiceError(
      "At least one valid webhook event is required.",
      400
    );
  }

  const normalizedDescription =
    normalizeText(
      description
    );

  if (
    normalizedDescription.length >
    500
  ) {
    throw new WebhookServiceError(
      "Webhook description is too long.",
      400
    );
  }

  const duplicate =
    await WebhookEndpoint.exists({
      merchantId:
        merchantObjectId,

      environment,

      url:
        normalizedUrl,

      enabled:
        true,
    });

  if (duplicate) {
    throw new WebhookServiceError(
      "An active webhook endpoint already uses this URL.",
      409
    );
  }

  const signingSecret =
    generateWebhookSigningSecret();

  const endpoint =
    await WebhookEndpoint.create({
      merchantId:
        merchantObjectId,

      url:
        normalizedUrl,

      environment,

      events:
        normalizedEvents,

      enabled:
        true,

      description:
        normalizedDescription ||
        undefined,

      signingSecretEncrypted:
        encryptData(
          signingSecret
        ),

      secretHint:
        webhookSecretHint(
          signingSecret
        ),

      secretVersion:
        1,
    });

  return {
    endpoint,

    /*
     * Returned once only.
     */
    signingSecret,
  };
}

/* =========================================================
   LIST ENDPOINTS
========================================================= */

export async function listWebhookEndpoints({
  merchantId,
  environment,
}: {
  merchantId: string;

  environment:
    WebhookEnvironment;
}) {
  const merchantObjectId =
    requireMerchantId(
      merchantId
    );

  return WebhookEndpoint.find({
    merchantId:
      merchantObjectId,

    environment,
  })
    .sort({
      createdAt:
        -1,
    })
    .lean();
}

/* =========================================================
   DISABLE ENDPOINT
========================================================= */

export async function deleteWebhookEndpoint({
  merchantId,
  environment,
  endpointId,
}: {
  merchantId: string;

  environment:
    WebhookEnvironment;

  endpointId: string;
}) {
  const endpoint =
    await WebhookEndpoint.findOneAndUpdate(
      {
        _id:
          requireEndpointId(
            endpointId
          ),

        merchantId:
          requireMerchantId(
            merchantId
          ),

        environment,
      },
      {
        $set: {
          enabled:
            false,
        },
      },
      {
        new:
          true,

        runValidators:
          true,
      }
    );

  if (!endpoint) {
    throw new WebhookServiceError(
      "Webhook endpoint not found.",
      404
    );
  }

  return endpoint;
}

/* =========================================================
   ROTATE SECRET
========================================================= */

export async function rotateWebhookEndpointSecret({
  merchantId,
  environment,
  endpointId,
}: {
  merchantId: string;

  environment:
    WebhookEnvironment;

  endpointId: string;
}) {
  const signingSecret =
    generateWebhookSigningSecret();

  const endpoint =
    await WebhookEndpoint.findOneAndUpdate(
      {
        _id:
          requireEndpointId(
            endpointId
          ),

        merchantId:
          requireMerchantId(
            merchantId
          ),

        environment,

        enabled:
          true,
      },
      {
        $set: {
          signingSecretEncrypted:
            encryptData(
              signingSecret
            ),

          secretHint:
            webhookSecretHint(
              signingSecret
            ),

          secretRotatedAt:
            new Date(),
        },

        $inc: {
          secretVersion:
            1,
        },
      },
      {
        new:
          true,

        runValidators:
          true,
      }
    );

  if (!endpoint) {
    throw new WebhookServiceError(
      "Active webhook endpoint not found.",
      404
    );
  }

  return {
    endpoint,

    signingSecret,
  };
}

/* =========================================================
   CREATE PAYMENT EVENTS
========================================================= */

export async function createPaymentWebhookEvents({
  payment,
  eventType,
}: {
  payment:
    PaymentWebhookInput;

  eventType:
    WebhookEventType;
}): Promise<void> {
  if (
    !(
      WEBHOOK_EVENTS as
        readonly string[]
    ).includes(
      eventType
    )
  ) {
    throw new WebhookServiceError(
      "Unsupported webhook event type.",
      400
    );
  }

  const merchantObjectId =
    requireMerchantId(
      payment.merchantId
    );

  const endpoints =
    await WebhookEndpoint.find({
      merchantId:
        merchantObjectId,

      environment:
        payment.mode,

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
     * WebhookEvent currently represents one endpoint
     * delivery, so every endpoint needs its own eventId.
     */
    const eventId =
      generateEventId();

    const payload:
      Record<string, unknown> = {
      id:
        eventId,

      type:
        eventType,

      created:
        new Date()
          .toISOString(),

      livemode:
        payment.mode ===
        "live",

      data: {
        payment: {
          id:
            payment.paymentId,

          status:
            payment.status,

          amount:
            moneyString(
              payment.amount
            ),

          currency:
            payment.currency,

          merchantId:
            payment.merchantId,

          customerId:
            optionalId(
              payment.customerId
            ),

          orderId:
            optionalId(
              payment.orderId
            ),

          merchantReference:
            optionalId(
              payment
                .merchantReference
            ),

          provider:
            payment.provider,

          sourceType:
            payment.sourceType,

          mode:
            payment.mode,

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

    const event =
      await WebhookEvent.create({
        eventId,

        merchantId:
          merchantObjectId,

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

    try {
      await enqueueWebhookDelivery(
        event._id.toString()
      );
    } catch (
      queueError
    ) {
      /*
       * Event remains pending in MongoDB.
       * The worker recovery scan will enqueue it later.
       */
      console.error(
        "WEBHOOK ENQUEUE ERROR:",
        {
          eventId:
            event.eventId,

          message:
            queueError instanceof
              Error
              ? queueError.message
              : "Unknown queue error",
        }
      );
    }
  }
}

/* =========================================================
   DELIVER EVENT
========================================================= */

export async function deliverWebhookEvent(
  webhookEventDocumentId:
    string
): Promise<void> {
  if (
    !mongoose.isValidObjectId(
      webhookEventDocumentId
    )
  ) {
    throw new Error(
      "Invalid webhook event document ID."
    );
  }

  const now =
    new Date();

  /*
   * Atomic acquisition prevents two workers from
   * delivering the same event simultaneously.
   */
  const event =
    await WebhookEvent.findOneAndUpdate(
      {
        _id:
          new mongoose.Types.ObjectId(
            webhookEventDocumentId
          ),

        status: {
          $in: [
            "pending",
            "failed",
          ],
        },

        attempts: {
          $lt:
            MAX_WEBHOOK_ATTEMPTS,
        },
      },
      {
        $set: {
          status:
            "processing",

          processingStartedAt:
            now,

          lastAttemptAt:
            now,
        },

        $inc: {
          attempts:
            1,
        },
      },
      {
        new:
          true,
      }
    );

  if (!event) {
    return;
  }

  const endpoint =
    await WebhookEndpoint.findOne({
      _id:
        event.endpointId,

      merchantId:
        event.merchantId,

      environment:
        event.environment,

      enabled:
        true,
    }).select(
      "+signingSecretEncrypted"
    );

  if (
    !endpoint ||
    !endpoint
      .signingSecretEncrypted
  ) {
    event.status =
      "failed";

    event.processingStartedAt =
      undefined;

    event.nextAttemptAt =
      undefined;

    event.lastError =
      "Webhook endpoint is disabled, missing, or requires secret rotation.";

    await event.save();

    return;
  }

  let responseStatus:
    number | undefined;

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      deliveryTimeout()
    );

  timeout.unref();

  try {
    const destination =
      await normalizeWebhookUrl(
        endpoint.url
      );

    const encryptedSecret =
      endpoint
        .signingSecretEncrypted;

    const signingSecret =
      decryptData({
        encrypted:
          encryptedSecret
            .encrypted,

        iv:
          encryptedSecret.iv,

        authTag:
          encryptedSecret
            .authTag,
      });

    const rawBody =
      JSON.stringify(
        event.payload
      );

    const timestamp =
      Math.floor(
        Date.now() /
          1000
      ).toString();

    const signature =
      createWebhookSignature({
        secret:
          signingSecret,

        timestamp,

        rawBody,
      });

    const response =
      await fetch(
        destination,
        {
          method:
            "POST",

          redirect:
            "manual",

          headers: {
            "Content-Type":
              "application/json",

            "User-Agent":
              "Coffer-Webhooks/1.0",

            "Coffer-Event-Id":
              event.eventId,

            "Coffer-Event-Type":
              event.type,

            "Coffer-Timestamp":
              timestamp,

            "Coffer-Signature":
              signature,

            "Idempotency-Key":
              event.eventId,
          },

          body:
            rawBody,

          signal:
            controller.signal,
        }
      );

    responseStatus =
      response.status;

    if (!response.ok) {
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
            : ""
        }`
      );
    }

    const deliveredAt =
      new Date();

    event.status =
      "delivered";

    event.deliveredAt =
      deliveredAt;

    event.processingStartedAt =
      undefined;

    event.nextAttemptAt =
      undefined;

    event.lastError =
      undefined;

    event.lastResponseStatus =
      response.status;

    await event.save();

    await WebhookEndpoint.updateOne(
      {
        _id:
          endpoint._id,
      },
      {
        $set: {
          lastDeliveredAt:
            deliveredAt,
        },
      }
    );
  } catch (
    deliveryError
  ) {
    const message =
      deliveryError instanceof
        Error &&
      deliveryError.name ===
        "AbortError"
        ? "Webhook delivery timed out."
        : deliveryError instanceof
            Error
          ? deliveryError.message
          : "Webhook delivery failed.";

    const canRetry =
      event.attempts <
      MAX_WEBHOOK_ATTEMPTS;

    event.status =
      "failed";

    event.processingStartedAt =
      undefined;

    event.lastResponseStatus =
      responseStatus;

    event.lastError =
      message.slice(
        0,
        2000
      );

    event.nextAttemptAt =
      canRetry
        ? new Date(
            Date.now() +
              retryDelay(
                event.attempts
              )
          )
        : undefined;

    await event.save();

    /*
     * Throwing tells BullMQ to apply its configured
     * exponential retry.
     */
    throw new Error(
      message
    );
  } finally {
    clearTimeout(
      timeout
    );
  }
}

/* =========================================================
   LIST DELIVERY EVENTS
========================================================= */

export async function listWebhookEvents({
  merchantId,
  environment,
  status,
  page = 1,
  limit = 20,
}: {
  merchantId: string;

  environment:
    WebhookEnvironment;

  status?: string;

  page?: number;

  limit?: number;
}) {
  const validStatuses:
    WebhookEventStatus[] = [
      "pending",
      "processing",
      "delivered",
      "failed",
    ];

  const normalizedStatus =
    normalizeText(
      status
    );

  if (
    normalizedStatus &&
    !validStatuses.includes(
      normalizedStatus as
        WebhookEventStatus
    )
  ) {
    throw new WebhookServiceError(
      "Invalid webhook status filter.",
      400
    );
  }

  const safePage =
    Number.isInteger(
      page
    ) &&
    page > 0
      ? page
      : 1;

  const safeLimit =
    Number.isInteger(
      limit
    )
      ? Math.min(
          Math.max(
            limit,
            1
          ),
          100
        )
      : 20;

  const filter:
    Record<string, unknown> = {
      merchantId:
        requireMerchantId(
          merchantId
        ),

      environment,
    };

  if (normalizedStatus) {
    filter.status =
      normalizedStatus;
  }

  const [
    events,
    total,
  ] = await Promise.all([
    WebhookEvent.find(
      filter
    )
      .sort({
        createdAt:
          -1,
      })
      .skip(
        (
          safePage -
          1
        ) *
          safeLimit
      )
      .limit(
        safeLimit
      )
      .lean(),

    WebhookEvent.countDocuments(
      filter
    ),
  ]);

  return {
    events,

    pagination: {
      page:
        safePage,

      limit:
        safeLimit,

      total,

      totalPages:
        Math.ceil(
          total /
            safeLimit
        ),
    },
  };
}

/* =========================================================
   MANUAL RETRY
========================================================= */

export async function retryWebhookEvent({
  merchantId,
  environment,
  eventId,
}: {
  merchantId: string;

  environment:
    WebhookEnvironment;

  eventId: string;
}) {
  const normalizedEventId =
    normalizeText(
      eventId
    );

  if (!normalizedEventId) {
    throw new WebhookServiceError(
      "Webhook event ID is required.",
      400
    );
  }

  const event =
    await WebhookEvent.findOne({
      merchantId:
        requireMerchantId(
          merchantId
        ),

      environment,

      eventId:
        normalizedEventId,
    });

  if (!event) {
    throw new WebhookServiceError(
      "Webhook event not found.",
      404
    );
  }

  if (
    event.status ===
    "delivered"
  ) {
    throw new WebhookServiceError(
      "Delivered webhook events cannot be retried.",
      409
    );
  }

  if (
    event.status ===
    "processing"
  ) {
    throw new WebhookServiceError(
      "Webhook event is currently processing.",
      409
    );
  }

  event.status =
    "pending";

  event.attempts =
    0;

  event.processingStartedAt =
    undefined;

  event.lastAttemptAt =
    undefined;

  event.nextAttemptAt =
    new Date();

  event.deliveredAt =
    undefined;

  event.lastResponseStatus =
    undefined;

  event.lastError =
    undefined;

  await event.save();

  await enqueueWebhookDelivery(
    event._id.toString(),
    {
      force:
        true,
    }
  );

  return event;
}

/* =========================================================
   WORKER RECOVERY
========================================================= */

export async function recoverPendingWebhookDeliveries(
  limit = 200
): Promise<number> {
  const now =
    new Date();

  const staleBefore =
    new Date(
      Date.now() -
        5 *
          60_000
    );

  /*
   * Recover events left processing after a crashed worker.
   */
  await WebhookEvent.updateMany(
    {
      status:
        "processing",

      processingStartedAt: {
        $lt:
          staleBefore,
      },

      attempts: {
        $lt:
          MAX_WEBHOOK_ATTEMPTS,
      },
    },
    {
      $set: {
        status:
          "failed",

        nextAttemptAt:
          now,

        lastError:
          "Previous webhook worker stopped before completing delivery.",
      },

      $unset: {
        processingStartedAt:
          1,
      },
    }
  );

  const events =
    await WebhookEvent.find({
      attempts: {
        $lt:
          MAX_WEBHOOK_ATTEMPTS,
      },

      $or: [
        {
          status:
            "pending",
        },

        {
          status:
            "failed",

          nextAttemptAt: {
            $lte:
              now,
          },
        },
      ],
    })
      .select(
        "_id"
      )
      .sort({
        createdAt:
          1,
      })
      .limit(
        Math.min(
          Math.max(
            limit,
            1
          ),
          1000
        )
      )
      .lean();

  let queued =
    0;

  for (
    const event of
      events
  ) {
    try {
      await enqueueWebhookDelivery(
        event._id.toString()
      );

      queued +=
        1;
    } catch (
      error
    ) {
      console.error(
        "WEBHOOK RECOVERY ENQUEUE ERROR:",
        error instanceof Error
          ? error.message
          : error
      );
    }
  }

  return queued;
}
