import "dotenv/config";

import mongoose from "mongoose";

import type {
  Server,
} from "node:http";

import app from "./app.js";

import connectDB from "./config/db.js";

import {
  seedPaymentSources,
} from "./seed/paymentSourceSeed.js";

import {
  getEKYCRuntime,
  startEKYCWorkers,
  stopEKYCRuntime,
} from "./modules/ekyc/runtime/ekycRuntime.js";

import {
  closeWebhookQueue,
} from "./services/webhookQueue.js";

/* =========================================================
   CONFIGURATION
========================================================= */

const PORT =
  Number(
    process.env.PORT
  ) || 5000;

/* =========================================================
   SERVER STATE
========================================================= */

let httpServer:
  Server |
  null =
  null;

let shuttingDown =
  false;

/* =========================================================
   CLOSE HTTP SERVER
========================================================= */

async function closeHttpServer():
  Promise<void> {
  if (!httpServer) {
    return;
  }

  const activeServer =
    httpServer;

  httpServer =
    null;

  await new Promise<void>(
    (
      resolve,
      reject
    ) => {
      activeServer.close(
        (
          error
        ) => {
          if (error) {
            reject(
              error
            );

            return;
          }

          resolve();
        }
      );
    }
  );
}

/* =========================================================
   CLOSE INFRASTRUCTURE
========================================================= */

async function closeInfrastructure():
  Promise<void> {
  /*
   * Stop accepting and processing e-KYC jobs first.
   */
  await stopEKYCRuntime()
    .catch(
      (
        error
      ) => {
        console.error(
          "E-KYC RUNTIME SHUTDOWN ERROR:",
          error instanceof Error
            ? error.message
            : error
        );
      }
    );

  /*
   * Close the BullMQ Queue and its Redis connection.
   *
   * Webhook delivery Worker runs in:
   * src/webhookWorkerServer.ts
   */
  await closeWebhookQueue()
    .catch(
      (
        error
      ) => {
        console.error(
          "WEBHOOK QUEUE SHUTDOWN ERROR:",
          error instanceof Error
            ? error.message
            : error
        );
      }
    );

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
            "MONGODB SHUTDOWN ERROR:",
            error instanceof Error
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
  signal: string,
  exitCode = 0
): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown =
    true;

  console.log(
    `${signal} received. Closing the Coffer API safely...`
  );

  const forceExit =
    setTimeout(
      () => {
        console.error(
          "Graceful shutdown timed out."
        );

        process.exit(
          1
        );
      },
      15_000
    );

  forceExit.unref();

  try {
    /*
     * Stop receiving new HTTP requests.
     */
    await closeHttpServer();

    /*
     * Close Redis, workers and MongoDB.
     */
    await closeInfrastructure();

    clearTimeout(
      forceExit
    );

    console.log(
      "✅ Coffer API stopped safely."
    );

    process.exit(
      exitCode
    );
  } catch (
    error
  ) {
    clearTimeout(
      forceExit
    );

    console.error(
      "API SHUTDOWN ERROR:",
      error instanceof Error
        ? error.message
        : error
    );

    await closeInfrastructure();

    process.exit(
      1
    );
  }
}

/* =========================================================
   START SERVER
========================================================= */

async function startServer():
  Promise<void> {
  try {
    /* =====================================================
       DATABASE
    ====================================================== */

    await connectDB();

    console.log(
      "✅ MongoDB connected successfully."
    );

    /* =====================================================
       DEMO PAYMENT SOURCES
    ====================================================== */

    await seedPaymentSources();

    /* =====================================================
       ADVANCED E-KYC RUNTIME

       Connects:
       - Redis
       - BullMQ queues
       - Qdrant
       - Provider factory
       - Media store
       - Compliance provider
    ====================================================== */

    await getEKYCRuntime();

    /* =====================================================
       E-KYC WORKERS

       These can be disabled when workers run in a
       separate deployment process.
    ====================================================== */

    if (
      process.env
        .EKYC_RUN_WORKERS !==
      "false"
    ) {
      await startEKYCWorkers();
    }

    /* =====================================================
       HTTP SERVER
    ====================================================== */

    httpServer =
      app.listen(
        PORT,
        () => {
          console.log(
            `🚀 Coffer API running on port ${PORT}`
          );

          console.log(
            `🌐 http://localhost:${PORT}`
          );

          console.log(
            process.env
              .EKYC_RUN_WORKERS ===
              "false"
              ? "ℹ️ e-KYC workers are disabled in this process."
              : "✅ Advanced e-KYC workers started."
          );

          console.log(
            "ℹ️ Merchant webhook delivery runs through webhookWorkerServer.ts."
          );
        }
      );

    /* =====================================================
       HTTP SERVER ERROR
    ====================================================== */

    httpServer.once(
      "error",
      (
        error
      ) => {
        console.error(
          "HTTP SERVER ERROR:",
          error
        );

        void shutdown(
          "HTTP_SERVER_ERROR",
          1
        );
      }
    );
  } catch (
    error
  ) {
    console.error(
      "❌ Server startup failed:",
      error instanceof Error
        ? error.message
        : "Unknown error"
    );

    await closeInfrastructure();

    process.exit(
      1
    );
  }
}

/* =========================================================
   PROCESS SIGNALS
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
      "UNCAUGHT EXCEPTION:",
      error
    );

    void shutdown(
      "UNCAUGHT_EXCEPTION",
      1
    );
  }
);

process.once(
  "unhandledRejection",
  (
    reason
  ) => {
    console.error(
      "UNHANDLED REJECTION:",
      reason
    );

    void shutdown(
      "UNHANDLED_REJECTION",
      1
    );
  }
);

/* =========================================================
   BOOT
========================================================= */

void startServer();