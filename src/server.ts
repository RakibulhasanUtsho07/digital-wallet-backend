import "dotenv/config";

import mongoose from "mongoose";

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

const PORT =
  Number(
    process.env.PORT
  ) || 5000;

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
    ====================================================== */

    if (
      process.env
        .EKYC_RUN_WORKERS !==
      "false"
    ) {
      await startEKYCWorkers();
    }

    /* =====================================================
       START HTTP SERVER
    ====================================================== */

    const server =
      app.listen(
        PORT,
        () => {
          console.log(
            `🚀 Server running on port ${PORT}`
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
        }
      );

    /* =====================================================
       GRACEFUL SHUTDOWN
    ====================================================== */

    let shuttingDown =
      false;

    const shutdown =
      async (
        signal: string
      ): Promise<void> => {
        if (shuttingDown) {
          return;
        }

        shuttingDown =
          true;

        console.log(
          `${signal} received. Closing the API safely...`
        );

        const forceExit =
          setTimeout(
            () => {
              console.error(
                "Graceful shutdown timed out."
              );

              process.exit(1);
            },
            15_000
          );

        forceExit.unref();

        server.close(
          async (
            serverError
          ) => {
            try {
              await stopEKYCRuntime();

              await mongoose.disconnect();

              clearTimeout(
                forceExit
              );

              process.exit(
                serverError
                  ? 1
                  : 0
              );
            } catch (error) {
              console.error(
                "Shutdown failed:",
                error instanceof
                  Error
                  ? error.message
                  : "Unknown error"
              );

              process.exit(1);
            }
          }
        );
      };

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
  } catch (error) {
    console.error(
      "❌ Server startup failed:",
      error instanceof Error
        ? error.message
        : "Unknown error"
    );

    await stopEKYCRuntime()
      .catch(
        () => undefined
      );

    await mongoose
      .disconnect()
      .catch(
        () => undefined
      );

    process.exit(1);
  }
}

void startServer();