import {
  Queue,
} from "bullmq";

import IORedis from "ioredis";

/* =========================================================
   REDIS URL
========================================================= */

const redisUrl =
  process.env.REDIS_URL?.trim() ||
  "redis://127.0.0.1:6379";

/* =========================================================
   CONNECTION
========================================================= */

export const webhookRedisConnection =
  new IORedis(
    redisUrl,
    {
      maxRetriesPerRequest:
        null,
    }
  );

/* =========================================================
   QUEUE
========================================================= */

export const webhookQueue =
  new Queue(
    "damo-webhook-delivery",
    {
      connection:
        webhookRedisConnection,

      defaultJobOptions: {
        removeOnComplete: 500,

        removeOnFail: 1000,
      },
    }
  );

/* =========================================================
   ADD WEBHOOK JOB
========================================================= */

export const enqueueWebhookDelivery =
  async (
    webhookEventId: string
  ): Promise<void> => {
    await webhookQueue.add(
      "deliver-webhook",
      {
        webhookEventId,
      },
      {
        jobId:
          webhookEventId,
      }
    );
  };