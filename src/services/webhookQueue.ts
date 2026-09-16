import {
  Queue,
} from "bullmq";

import IORedis from "ioredis";

/* =========================================================
   TYPES
========================================================= */

export interface WebhookDeliveryJobData {
  webhookEventId: string;
}

export interface EnqueueWebhookOptions {
  force?: boolean;
}

/* =========================================================
   CONSTANTS
========================================================= */

export const WEBHOOK_QUEUE_NAME =
  "coffer-webhook-delivery";

export const MAX_WEBHOOK_ATTEMPTS =
  6;

const WEBHOOK_BACKOFF_DELAY_MS =
  60_000;

/* =========================================================
   REDIS
========================================================= */

function getRedisUrl(): string {
  const configured =
    process.env.REDIS_URL
      ?.trim();

  if (configured) {
    return configured;
  }

  if (
    process.env.NODE_ENV ===
    "production"
  ) {
    throw new Error(
      "REDIS_URL is required in production."
    );
  }

  return "redis://127.0.0.1:6379";
}

export const webhookRedisConnection =
  new IORedis(
    getRedisUrl(),
    {
      maxRetriesPerRequest:
        null,

      enableReadyCheck:
        true,
    }
  );

webhookRedisConnection.on(
  "error",
  (
    error
  ) => {
    console.error(
      "COFFER WEBHOOK REDIS ERROR:",
      error.message
    );
  }
);

/* =========================================================
   QUEUE
========================================================= */

export const webhookQueue =
  new Queue<WebhookDeliveryJobData>(
    WEBHOOK_QUEUE_NAME,
    {
      connection:
        webhookRedisConnection,

      defaultJobOptions: {
        attempts:
          MAX_WEBHOOK_ATTEMPTS,

        backoff: {
          type:
            "exponential",

          delay:
            WEBHOOK_BACKOFF_DELAY_MS,
        },

        removeOnComplete: {
          count:
            500,
        },

        removeOnFail: {
          count:
            1000,
        },
      },
    }
  );

/* =========================================================
   ENQUEUE
========================================================= */

export async function enqueueWebhookDelivery(
  webhookEventId: string,
  options:
    EnqueueWebhookOptions = {}
): Promise<void> {
  const normalizedId =
    webhookEventId.trim();

  if (!normalizedId) {
    throw new Error(
      "Webhook event ID is required."
    );
  }

  const existingJob =
    await webhookQueue.getJob(
      normalizedId
    );

  if (existingJob) {
    if (!options.force) {
      return;
    }

    const state =
      await existingJob.getState();

    if (
      state === "active"
    ) {
      throw new Error(
        "Webhook delivery is currently processing."
      );
    }

    await existingJob.remove();
  }

  await webhookQueue.add(
    "deliver-webhook",
    {
      webhookEventId:
        normalizedId,
    },
    {
      jobId:
        normalizedId,

      attempts:
        MAX_WEBHOOK_ATTEMPTS,

      backoff: {
        type:
          "exponential",

        delay:
          WEBHOOK_BACKOFF_DELAY_MS,
      },
    }
  );
}

/* =========================================================
   CLOSE
========================================================= */

export async function closeWebhookQueue():
  Promise<void> {
  await webhookQueue.close();

  if (
    webhookRedisConnection.status !==
    "end"
  ) {
    await webhookRedisConnection.quit();
  }
}