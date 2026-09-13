import "dotenv/config";

import mongoose from "mongoose";

import {
  Worker,
} from "bullmq";

import IORedis from "ioredis";

import connectDB from "./config/db.js";

import {
  deliverWebhookEvent,
  recoverPendingWebhookDeliveries,
} from "./services/webhookService.js";

import {
  closeWebhookQueue,
  WEBHOOK_QUEUE_NAME,
  type WebhookDeliveryJobData,
} from "./services/webhookQueue.js";

/* =========================================================
   CONFIGURATION
========================================================= */

function getRedisUrl(): string {
  const configuredUrl =
    process.env.REDIS_URL
      ?.trim();

  if (configuredUrl) {
    return configuredUrl;
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

function getWorkerConcurrency():
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
   WORKER REDIS CONNECTION

   BullMQ Worker requires its own blocking Redis connection.
========================================================= */

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
  "connect",
  () => {
    console.log(
      "✅ Coffer webhook worker connected to Redis."
    );
  }
);

workerRedisConnection.on(
  "ready",
  () => {
    console.log(
      "✅ Coffer webhook worker Redis connection is ready."
    );
  }
);

workerRedisConnection.on(
  "error",
  (
    error
  ) => {
    console.error(
      "COFFER WEBHOOK WORKER REDIS ERROR:",
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

let shuttingDown =
  false;

/* =========================================================
   CREATE WORKER
========================================================= */

function createWebhookWorker():
  Worker<WebhookDeliveryJobData> {
  const webhookWorker =
    new Worker<WebhookDeliveryJobData>(
      WEBHOOK_QUEUE_NAME,

      async (
        job
      ): Promise<void> => {
        const webhookEventId =
          job.data
            ?.webhookEventId;

        if (
          typeof webhookEventId !==
            "string" ||
          !webhookEventId.trim()
        ) {
          throw new Error(
            "Webhook event ID is missing from the job."
          );
        }

        await deliverWebhookEvent(
          webhookEventId.trim()
        );
      },

      {
        connection:
          workerRedisConnection,

        concurrency:
          getWorkerConcurrency(),

        /*
         * BullMQ can recover a job when a worker
         * crashes while processing it.
         */
        lockDuration:
          30_000,

        maxStalledCount:
          2,

        autorun:
          true,
      }
    );

  /* =======================================================
     WORKER EVENTS
  ======================================================= */

  webhookWorker.on(
    "active",
    (
      job
    ) => {
      console.log(
        "COFFER WEBHOOK JOB STARTED:",
        {
          jobId:
            job.id,

          webhookEventId:
            job.data
              .webhookEventId,

          attempt:
            job.attemptsMade +
            1,
        }
      );
    }
  );

  webhookWorker.on(
    "completed",
    (
      job
    ) => {
      console.log(
        "COFFER WEBHOOK JOB COMPLETED:",
        {
          jobId:
            job.id,

          webhookEventId:
            job.data
              .webhookEventId,

          attemptsMade:
            job.attemptsMade,
        }
      );
    }
  );

  webhookWorker.on(
    "failed",
    (
      job,
      error
    ) => {
      console.error(
        "COFFER WEBHOOK JOB FAILED:",
        {
          jobId:
            job?.id,

          webhookEventId:
            job?.data
              ?.webhookEventId,

          attemptsMade:
            job?.attemptsMade,

          message:
            error.message,
        }
      );
    }
  );

  webhookWorker.on(
    "stalled",
    (
      jobId
    ) => {
      console.warn(
        "COFFER WEBHOOK JOB STALLED:",
        jobId
      );
    }
  );

  webhookWorker.on(
    "error",
    (
      error
    ) => {
      console.error(
        "COFFER WEBHOOK WORKER ERROR:",
        error.message
      );
    }
  );

  webhookWorker.on(
    "closed",
    () => {
      console.log(
        "Coffer webhook worker closed."
      );
    }
  );

  return webhookWorker;
}

/* =========================================================
   PERIODIC RECOVERY

   MongoDB remains the durable source of delivery status.

   If Redis was temporarily unavailable when an event was
   created, this scan will add that pending event later.
========================================================= */

function startRecoveryScan():
  void {
  if (recoveryTimer) {
    return;
  }

  recoveryTimer =
    setInterval(
      () => {
        void recoverPendingWebhookDeliveries()
          .then(
            (
              recovered
            ) => {
              if (
                recovered >
                0
              ) {
                console.log(
                  `Recovered ${recovered} pending webhook event(s).`
                );
              }
            }
          )
          .catch(
            (
              error
            ) => {
              console.error(
                "WEBHOOK RECOVERY SCAN ERROR:",
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

  /*
   * Recovery timer alone should not prevent
   * Node.js from shutting down.
   */
  recoveryTimer.unref();
}

function stopRecoveryScan():
  void {
  if (!recoveryTimer) {
    return;
  }

  clearInterval(
    recoveryTimer
  );

  recoveryTimer =
    null;
}

/* =========================================================
   START WORKER SERVER
========================================================= */

async function startWebhookWorkerServer():
  Promise<void> {
  try {
    /* =====================================================
       DATABASE

       deliverWebhookEvent() needs MongoDB to load:
       - WebhookEvent
       - WebhookEndpoint
       - Encrypted signing secret
    ====================================================== */

    await connectDB();

    console.log(
      "✅ Webhook worker MongoDB connected."
    );

    /* =====================================================
       WORKER
    ====================================================== */

    worker =
      createWebhookWorker();

    await worker.waitUntilReady();

    /* =====================================================
       RECOVER EVENTS CREATED WHILE QUEUE WAS UNAVAILABLE
    ====================================================== */

    const recovered =
      await recoverPendingWebhookDeliveries();

    console.log(
      `✅ Coffer webhook worker is running. Recovered ${recovered} event(s).`
    );

    startRecoveryScan();
  } catch (
    error
  ) {
    console.error(
      "❌ Coffer webhook worker startup failed:",
      error instanceof Error
        ? error.message
        : error
    );

    await cleanupResources();

    process.exit(
      1
    );
  }
}

/* =========================================================
   CLEANUP
========================================================= */

async function cleanupResources():
  Promise<void> {
  stopRecoveryScan();

  if (worker) {
    await worker
      .close()
      .catch(
        (
          error
        ) => {
          console.error(
            "WEBHOOK WORKER CLOSE ERROR:",
            error instanceof
              Error
              ? error.message
              : error
          );
        }
      );

    worker =
      null;
  }

  /*
   * Closes the Queue object and its separate
   * Redis connection.
   */
  await closeWebhookQueue()
    .catch(
      (
        error
      ) => {
        console.error(
          "WEBHOOK QUEUE CLOSE ERROR:",
          error instanceof
            Error
            ? error.message
            : error
        );
      }
    );

  /*
   * Close the Redis connection owned by the Worker.
   */
  if (
    workerRedisConnection.status !==
    "end"
  ) {
    await workerRedisConnection
      .quit()
      .catch(
        (
          error
        ) => {
          console.error(
            "WEBHOOK WORKER REDIS CLOSE ERROR:",
            error instanceof
              Error
              ? error.message
              : error
          );

          workerRedisConnection.disconnect();
        }
      );
  }

  if (
    mongoose.connection
      .readyState !==
    0
  ) {
    await mongoose
      .disconnect()
      .catch(
        (
          error
        ) => {
          console.error(
            "WEBHOOK MONGODB CLOSE ERROR:",
            error instanceof
              Error
              ? error.message
              : error
          );
        }
      );
  }
}

/* =========================================================
   GRACEFUL SHUTDOWN
========================================================= */

async function shutdown(
  signal: string
): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown =
    true;

  console.log(
    `${signal} received. Closing Coffer webhook worker safely...`
  );

  const forceExit =
    setTimeout(
      () => {
        console.error(
          "Webhook worker graceful shutdown timed out."
        );

        process.exit(
          1
        );
      },

      15_000
    );

  forceExit.unref();

  try {
    await cleanupResources();

    clearTimeout(
      forceExit
    );

    console.log(
      "✅ Coffer webhook worker stopped safely."
    );

    process.exit(
      0
    );
  } catch (
    error
  ) {
    clearTimeout(
      forceExit
    );

    console.error(
      "WEBHOOK WORKER SHUTDOWN ERROR:",
      error instanceof Error
        ? error.message
        : error
    );

    process.exit(
      1
    );
  }
}

/* =========================================================
   PROCESS EVENTS
========================================================= */

process.once(
  "SIGINT",
  () => {
    void shutdown(
      "SIGINT"
    );
  }
);

process.once(
  "SIGTERM",
  () => {
    void shutdown(
      "SIGTERM"
    );
  }
);

process.once(
  "uncaughtException",
  (
    error
  ) => {
    console.error(
      "WEBHOOK WORKER UNCAUGHT EXCEPTION:",
      error
    );

    void shutdown(
      "uncaughtException"
    );
  }
);

process.once(
  "unhandledRejection",
  (
    reason
  ) => {
    console.error(
      "WEBHOOK WORKER UNHANDLED REJECTION:",
      reason
    );

    void shutdown(
      "unhandledRejection"
    );
  }
);

/* =========================================================
   BOOT
========================================================= */

void startWebhookWorkerServer();