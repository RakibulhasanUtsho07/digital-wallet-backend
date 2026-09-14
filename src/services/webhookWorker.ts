import {
  Worker,
} from "bullmq";

import IORedis from "ioredis";

import {
  deliverWebhookEvent,
  recoverPendingWebhookDeliveries,
} from "./webhookService.js";

import {
  WEBHOOK_QUEUE_NAME,
  type WebhookDeliveryJobData,
} from "./webhookQueue.js";

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

const workerRedisConnection =
  new IORedis(
    getRedisUrl(),
    {
      maxRetriesPerRequest:
        null,

      enableReadyCheck:
        true,
    }
  );

workerRedisConnection.on(
  "error",
  (
    error
  ) => {
    console.error(
      "WEBHOOK WORKER REDIS ERROR:",
      error.message
    );
  }
);

/* =========================================================
   STATE
========================================================= */

let worker:
  Worker<WebhookDeliveryJobData> |
  null =
  null;

let recoveryTimer:
  NodeJS.Timeout |
  null =
  null;

/* =========================================================
   CONCURRENCY
========================================================= */

function workerConcurrency():
  number {
  const configured =
    Number(
      process.env
        .WEBHOOK_WORKER_CONCURRENCY
    );

  if (
    !Number.isInteger(
      configured
    )
  ) {
    return 10;
  }

  return Math.min(
    Math.max(
      configured,
      1
    ),
    50
  );
}

/* =========================================================
   START
========================================================= */

export async function startWebhookWorker():
  Promise<void> {
  if (worker) {
    return;
  }

  worker =
    new Worker<WebhookDeliveryJobData>(
      WEBHOOK_QUEUE_NAME,
      async (
        job
      ) => {
        await deliverWebhookEvent(
          job.data
            .webhookEventId
        );
      },
      {
        connection:
          workerRedisConnection,

        concurrency:
          workerConcurrency(),

        lockDuration:
          30_000,

        maxStalledCount:
          2,
      }
    );

  worker.on(
    "completed",
    (
      job
    ) => {
      console.log(
        "WEBHOOK JOB COMPLETED:",
        job.id
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
        {
          jobId:
            job?.id,

          attemptsMade:
            job?.attemptsMade,

          message:
            error.message,
        }
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
        error.message
      );
    }
  );

  await worker.waitUntilReady();

  const recovered =
    await recoverPendingWebhookDeliveries();

  console.log(
    `✅ Coffer webhook worker started. Recovered ${recovered} event(s).`
  );

  recoveryTimer =
    setInterval(
      () => {
        void recoverPendingWebhookDeliveries()
          .catch(
            (
              error
            ) => {
              console.error(
                "WEBHOOK RECOVERY ERROR:",
                error instanceof
                  Error
                  ? error.message
                  : error
              );
            }
          );
      },
      60_000
    );

  recoveryTimer.unref();
}

/* =========================================================
   STOP
========================================================= */

export async function stopWebhookWorker():
  Promise<void> {
  if (recoveryTimer) {
    clearInterval(
      recoveryTimer
    );

    recoveryTimer =
      null;
  }

  if (worker) {
    await worker.close();

    worker =
      null;
  }

  if (
    workerRedisConnection.status !==
    "end"
  ) {
    await workerRedisConnection.quit();
  }
}