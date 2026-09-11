import {
  Worker,
} from "bullmq";

import IORedis from "ioredis";

import {
  deliverWebhookEvent,
} from "./services/webhookService.js";

/* =========================================================
   REDIS
========================================================= */

const redisUrl =
  process.env.REDIS_URL?.trim() ||
  "redis://127.0.0.1:6379";

const connection =
  new IORedis(
    redisUrl,
    {
      maxRetriesPerRequest:
        null,
    }
  );

/* =========================================================
   WORKER
========================================================= */

const worker =
  new Worker(
    "damo-webhook-delivery",

    async (
      job
    ) => {
      const webhookEventId =
        job.data
          ?.webhookEventId;

      if (
        typeof webhookEventId !==
        "string"
      ) {
        throw new Error(
          "Webhook event ID is missing."
        );
      }

      await deliverWebhookEvent(
        webhookEventId
      );
    },

    {
      connection,

      concurrency: 10,
    }
  );

/* =========================================================
   EVENTS
========================================================= */

worker.on(
  "completed",
  (
    job
  ) => {
    console.log(
      `WEBHOOK JOB COMPLETED: ${job.id}`
    );
  }
);

worker.on(
  "failed",
  (
    job,
    error
  ) => {
    console.error(
      "WEBHOOK JOB FAILED:",
      job?.id,
      error
    );
  }
);

worker.on(
  "error",
  (
    error
  ) => {
    console.error(
      "WEBHOOK WORKER ERROR:",
      error
    );
  }
);

/* =========================================================
   GRACEFUL SHUTDOWN
========================================================= */

const shutdown =
  async () => {
    console.log(
      "Shutting down webhook worker..."
    );

    await worker.close();

    await connection.quit();

    process.exit(
      0
    );
  };

process.once(
  "SIGINT",
  () => {
    void shutdown();
  }
);

process.once(
  "SIGTERM",
  () => {
    void shutdown();
  }
);

console.log(
  "DAMO webhook worker is running."
);