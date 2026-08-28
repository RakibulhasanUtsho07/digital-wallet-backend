import "dotenv/config";

import mongoose from "mongoose";

import {
  Transaction,
} from "../models/Transaction.js";

import {
  encryptData,
} from "../utils/crypto.js";

/* =========================================================
   DATABASE URI
========================================================= */

function getMongoUri(): string {
  const uri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.MONGO_DB_URI;

  if (!uri) {
    throw new Error(
      "MongoDB URI is missing."
    );
  }

  return uri;
}

/* =========================================================
   MIGRATE TRANSACTION REFERENCES
========================================================= */

async function migrateTransactionReferences(): Promise<void> {
  try {
    console.log(
      "Connecting to database..."
    );

    await mongoose.connect(
      getMongoUri()
    );

    console.log(
      "✅ Database connected"
    );

    /* =====================================================
       FIND LEGACY REFERENCES

       Only:
       - reference exists
       - referenceEncrypted does NOT exist
    ====================================================== */

    const transactions =
      await Transaction.collection
        .find({
          reference: {
            $exists: true,
          },

          referenceEncrypted: {
            $exists: false,
          },
        })
        .toArray();

    console.log(
      `Found ${transactions.length} transaction references to migrate`
    );

    let migrated = 0;
    let skipped = 0;
    let failed = 0;

    /* =====================================================
       MIGRATE
    ====================================================== */

    for (
      const transaction of
      transactions
    ) {
      try {
        if (
          typeof transaction.reference !==
          "string"
        ) {
          console.log(
            `⚠️ Skipped ${transaction._id}: reference is not a string`
          );

          skipped++;

          continue;
        }

        const reference =
          transaction.reference.trim();

        /*
         * Empty reference does not need encryption.
         */
        if (!reference) {
          console.log(
            `⚠️ Skipped ${transaction._id}: empty reference`
          );

          skipped++;

          continue;
        }

        /* =================================================
           ENCRYPT REFERENCE
        ================================================== */

        const referenceEncrypted =
          encryptData(
            reference
          );

        /* =================================================
           SAVE ENCRYPTED VALUE

           Plaintext reference is intentionally kept
           until verification succeeds.
        ================================================== */

        const result =
          await Transaction.collection.updateOne(
            {
              _id:
                transaction._id,

              referenceEncrypted: {
                $exists: false,
              },
            },
            {
              $set: {
                referenceEncrypted,
              },
            }
          );

        if (
          result.modifiedCount ===
          1
        ) {
          migrated++;

          console.log(
            `✅ Migrated reference: ${transaction._id}`
          );
        } else {
          skipped++;

          console.log(
            `⚠️ Skipped ${transaction._id}: already migrated`
          );
        }
      } catch (
        error: unknown
      ) {
        failed++;

        console.error(
          `❌ Failed ${transaction._id}:`,
          error instanceof Error
            ? error.message
            : error
        );
      }
    }

    /* =====================================================
       RESULT
    ====================================================== */

    console.log(
      "\n========== TRANSACTION REFERENCE MIGRATION =========="
    );

    console.log(
      `Migrated: ${migrated}`
    );

    console.log(
      `Skipped: ${skipped}`
    );

    console.log(
      `Failed: ${failed}`
    );

    console.log(
      "====================================================="
    );

    if (
      failed === 0
    ) {
      console.log(
        "✅ Transaction reference migration completed."
      );
    }
  } catch (
    error: unknown
  ) {
    console.error(
      "REFERENCE MIGRATION ERROR:",
      error instanceof Error
        ? error.message
        : error
    );

    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();

    console.log(
      "Database disconnected."
    );
  }
}

/* =========================================================
   RUN
========================================================= */

void migrateTransactionReferences();