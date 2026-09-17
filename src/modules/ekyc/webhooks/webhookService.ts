import {
  createHmac,
  randomUUID,
} from "node:crypto";

import {
  Queue,
  Worker,
  type JobsOptions,
} from "bullmq";

import type {
  Redis,
} from "ioredis";

import type {
  EKYCReasonCode,
  EKYCStatus,
} from "../types.js";

/* =========================================================
   CONFIGURATION
========================================================= */

export const EKYC_WEBHOOK_QUEUE_NAME =
  "ekyc-webhook-delivery-v1";

const WEBHOOK_TIMEOUT_MS = 5000;

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 8,

  backoff: {
    type: "exponential",
    delay: 2000,
  },

  removeOnComplete: {
    age: 24 * 60 * 60,
    count: 5000,
  },

  removeOnFail: {
    age: 7 * 24 * 60 * 60,
    count: 20_000,
  },
};

/* =========================================================
   TYPES
========================================================= */

export interface EKYCWebhookJobData {
  eventId: string;
  eventType: "EKYC_STATUS_CHANGED";

  verificationId: string;
  userId: string;

  status: EKYCStatus;
  reasonCodes: EKYCReasonCode[];

  occurredAt: string;
}

interface WebhookConfiguration {
  endpoint: URL;
  secret: string;
}

/* =========================================================
   CONFIG VALIDATION
========================================================= */

function getAllowedOrigins(): string[] {
  return (
    process.env
      .EKYC_WEBHOOK_ALLOWED_ORIGINS || ""
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      try {
        return new URL(origin).origin;
      } catch {
        throw new Error(
          `Invalid webhook origin configured: ${origin}`
        );
      }
    });
}

function getWebhookConfiguration():
  | WebhookConfiguration
  | null {
  const endpointValue =
    process.env.EKYC_WEBHOOK_URL?.trim();

  const secret =
    process.env.EKYC_WEBHOOK_SECRET?.trim();

  /*
   * Local development may run without a webhook receiver.
   * Production must never silently disable webhook delivery.
   */
  if (!endpointValue || !secret) {
    if (
      process.env.NODE_ENV === "production"
    ) {
      throw new Error(
        "EKYC_WEBHOOK_URL and EKYC_WEBHOOK_SECRET are required in production."
      );
    }

    return null;
  }

  if (secret.length < 32) {
    throw new Error(
      "EKYC_WEBHOOK_SECRET must contain at least 32 characters."
    );
  }

  const endpoint =
    new URL(endpointValue);

  if (endpoint.protocol !== "https:") {
    throw new Error(
      "The e-KYC webhook endpoint must use HTTPS."
    );
  }

  if (
    endpoint.username ||
    endpoint.password
  ) {
    throw new Error(
      "Webhook URLs cannot contain embedded credentials."
    );
  }

  const allowedOrigins =
    getAllowedOrigins();

  if (
    !allowedOrigins.includes(
      endpoint.origin
    )
  ) {
    throw new Error(
      "The e-KYC webhook endpoint origin is not allowlisted."
    );
  }

  return {
    endpoint,
    secret,
  };
}

/* =========================================================
   SIGNATURE
========================================================= */

function createWebhookSignature(
  secret: string,
  timestamp: string,
  body: string
): string {
  const digest =
    createHmac(
      "sha256",
      secret
    )
      .update(
        `${timestamp}.${body}`,
        "utf8"
      )
      .digest("hex");

  return `v1=${digest}`;
}

/* =========================================================
   QUEUE
========================================================= */

export function createEKYCWebhookQueue(
  connection: Redis
): Queue<EKYCWebhookJobData> {
  return new Queue<EKYCWebhookJobData>(
    EKYC_WEBHOOK_QUEUE_NAME,
    {
      connection,
      defaultJobOptions:
        DEFAULT_JOB_OPTIONS,
    }
  );
}

/* =========================================================
   ENQUEUE STATUS WEBHOOK
========================================================= */

export async function enqueueStatusWebhook(
  queue: Queue<EKYCWebhookJobData>,

  input: {
    verificationId: string;
    userId: string;
    status: EKYCStatus;
    reasonCodes: EKYCReasonCode[];
    occurredAt?: string;

    /*
     * Worker deterministic event ID পাঠাতে পারবে।
     * অন্য caller না পাঠালে নতুন UUID তৈরি হবে।
     */
    eventId?: string;
  }
): Promise<{
  eventId: string;
}> {
  const eventId =
    input.eventId?.trim() ||
    randomUUID();

  const jobData:
    EKYCWebhookJobData = {
    eventId,

    eventType:
      "EKYC_STATUS_CHANGED",

    verificationId:
      input.verificationId,

    userId:
      input.userId,

    status:
      input.status,

    reasonCodes: [
      ...new Set(
        input.reasonCodes
      ),
    ],

    occurredAt:
      input.occurredAt ||
      new Date().toISOString(),
  };

  await queue.add(
    "deliver-ekyc-status",
    jobData,
    {
      ...DEFAULT_JOB_OPTIONS,

      /*
       * একই event আবার enqueue হলে duplicate
       * webhook তৈরি হবে না।
       */
      jobId:
        eventId,
    }
  );

  return {
    eventId,
  };
}
/* =========================================================
   DELIVERY
========================================================= */

async function deliverWebhook(
  jobData: EKYCWebhookJobData,
  attemptNumber: number
): Promise<void> {
  const configuration =
    getWebhookConfiguration();

  /*
   * In local development the webhook receiver
   * can remain disabled.
   */
  if (!configuration) {
    return;
  }

  const timestamp =
    Math.floor(
      Date.now() / 1000
    ).toString();

  const body =
    JSON.stringify(jobData);

  const signature =
    createWebhookSignature(
      configuration.secret,
      timestamp,
      body
    );

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      WEBHOOK_TIMEOUT_MS
    );

  try {
    const response =
      await fetch(
        configuration.endpoint,
        {
          method: "POST",

          headers: {
            "content-type":
              "application/json",

            accept:
              "application/json",

            "user-agent":
              "Coffer-EKYC-Webhook/1.0",

            "x-ekyc-event-id":
              jobData.eventId,

            "x-ekyc-event-type":
              jobData.eventType,

            "x-ekyc-timestamp":
              timestamp,

            "x-ekyc-signature":
              signature,

            "x-idempotency-key":
              jobData.eventId,

            "x-webhook-attempt":
              String(
                attemptNumber
              ),
          },

          body,

          signal:
            controller.signal,

          redirect:
            "error",

          
        }
      );

    if (!response.ok) {
      throw new Error(
        `e-KYC webhook returned HTTP ${response.status}.`
      );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      throw new Error(
        "e-KYC webhook delivery timed out."
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/* =========================================================
   WEBHOOK WORKER
========================================================= */

export function createEKYCWebhookWorker(
  connection: Redis
): Worker<EKYCWebhookJobData> {
  const worker =
    new Worker<EKYCWebhookJobData>(
      EKYC_WEBHOOK_QUEUE_NAME,

      async (job) => {
        await deliverWebhook(
          job.data,
          job.attemptsMade + 1
        );

        return {
          delivered: true,
          eventId:
            job.data.eventId,
          deliveredAt:
            new Date().toISOString(),
        };
      },

      {
        connection,
        concurrency: 8,

        /*
         * Prevents a slow worker from holding
         * an expired lock indefinitely.
         */
        lockDuration: 15_000,
      }
    );

  worker.on(
    "error",
    (error) => {
      /*
       * Do not log job.data here because it may contain
       * identifiers. Only operational error information
       * should be sent to the telemetry service.
       */
      console.error(
        "EKYC WEBHOOK WORKER ERROR:",
        error.message
      );
    }
  );

  worker.on(
    "failed",
    (job, error) => {
      console.error(
        "EKYC WEBHOOK DELIVERY FAILED:",
        {
          eventId:
            job?.data.eventId,

          verificationId:
            job?.data
              .verificationId,

          attemptsMade:
            job?.attemptsMade,

          message:
            error.message,
        }
      );
    }
  );

  return worker;
}