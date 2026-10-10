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
   COFFER AI SUPPORT MONITORING
========================================================= */

import {
  startSupportAlertMonitor,
  stopSupportAlertMonitor,
} from "./modules/coffer-ai/monitoring/supportAlertMonitor.js";

import {
  startSupportMaintenanceMonitor,
  stopSupportMaintenanceMonitor,
} from "./modules/coffer-ai/monitoring/supportMaintenanceMonitor.js";

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
   ENV HELPERS
========================================================= */

function getPositiveIntegerEnv(
  key: string,
  fallback: number
): number {
  const raw =
    process.env[
      key
    ];

  if (!raw) {
    return fallback;
  }

  const parsed =
    Number.parseInt(
      raw,
      10
    );

  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed <= 0
  ) {
    return fallback;
  }

  return parsed;
}

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
   CLOSE COFFER AI MONITORS
========================================================= */

function closeCofferAiMonitors():
  void {
  try {
    stopSupportAlertMonitor();

    console.log(
      "✅ Coffer AI Support alert monitor stopped."
    );
  } catch (
    error
  ) {
    console.error(
      "COFFER AI ALERT MONITOR SHUTDOWN ERROR:",
      error instanceof Error
        ? error.message
        : error
    );
  }

  try {
    stopSupportMaintenanceMonitor();

    console.log(
      "✅ Coffer AI Support maintenance monitor stopped."
    );
  } catch (
    error
  ) {
    console.error(
      "COFFER AI MAINTENANCE MONITOR SHUTDOWN ERROR:",
      error instanceof Error
        ? error.message
        : error
    );
  }
}

/* =========================================================
   START COFFER AI SUPPORT MONITORS
========================================================= */

function startCofferAiMonitors():
  void {
  /* =====================================================
     PROACTIVE ALERT MONITOR

     Default:
     - enabled
     - every 5 minutes

     Detects:
     - payment failure spikes
     - provider failure spikes
     - repeated failure codes
     - SLA pressure
     - Support case inflow spikes
     - critical incidents
  ====================================================== */

  const alertMonitorEnabled =
    process.env
      .AI_SUPPORT_ALERT_MONITOR_ENABLED !==
    "false";

  if (
    alertMonitorEnabled
  ) {
    const intervalMinutes =
      getPositiveIntegerEnv(
        "AI_SUPPORT_ALERT_MONITOR_INTERVAL_MINUTES",
        5
      );

    startSupportAlertMonitor({
      intervalMinutes,
      runImmediately:
        true,
    });

    console.log(
      `✅ Coffer AI Support alert monitor started (${intervalMinutes} minute interval).`
    );
  } else {
    console.log(
      "ℹ️ Coffer AI Support alert monitor is disabled."
    );
  }

  /* =====================================================
     MAINTENANCE MONITOR

     Disabled by default because retention/deletion rules
     should be enabled intentionally in production.
  ====================================================== */

  const maintenanceEnabled =
    process.env
      .AI_SUPPORT_MAINTENANCE_ENABLED ===
    "true";

  if (
    maintenanceEnabled
  ) {
    const intervalHours =
      getPositiveIntegerEnv(
        "AI_SUPPORT_MAINTENANCE_INTERVAL_HOURS",
        24
      );

    startSupportMaintenanceMonitor({
      intervalHours,
      runImmediately:
        false,
    });

    console.log(
      `✅ Coffer AI Support maintenance monitor started (${intervalHours} hour interval).`
    );
  } else {
    console.log(
      "ℹ️ Coffer AI Support maintenance monitor is disabled."
    );
  }
}

/* =========================================================
   CLOSE INFRASTRUCTURE
========================================================= */

async function closeInfrastructure():
  Promise<void> {
  /*
   * Stop local Coffer AI monitoring timers first.
   */
  closeCofferAiMonitors();

  /*
   * Stop accepting and processing e-KYC jobs.
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
   * Close the BullMQ Queue and Redis connection.
   *
   * Merchant webhook delivery Worker runs in:
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

  /*
   * MongoDB shutdown.
   */
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
     * Close AI monitors, Redis,
     * e-KYC workers and MongoDB.
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
       COFFER AI SUPPORT MONITORS

       Start only after MongoDB is ready because:
       - alert evaluator reads payment data
       - incident detector reads Support data
       - alert records are stored in MongoDB
    ====================================================== */

    startCofferAiMonitors();

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
            process.env
              .AI_SUPPORT_ALERT_MONITOR_ENABLED ===
              "false"
              ? "ℹ️ Coffer AI Support alert monitor disabled."
              : "✅ Coffer AI Support alert monitor active."
          );

          console.log(
            process.env
              .AI_SUPPORT_MAINTENANCE_ENABLED ===
              "true"
              ? "✅ Coffer AI Support maintenance monitor active."
              : "ℹ️ Coffer AI Support maintenance monitor disabled."
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