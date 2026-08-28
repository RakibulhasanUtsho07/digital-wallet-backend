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
   AMOUNT -> MINOR UNIT

   Example:
   ৳500    -> 50000 poisha
   ৳10.50  -> 1050 poisha
========================================================= */

function toMinorUnits(
  amount: number
): number {
  return Math.round(
    amount * 100
  );
}

/* =========================================================
   MIGRATION
========================================================= */

async function migrateTransactionAmounts(): Promise<void> {
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
       FIND TRANSACTIONS

       শুধু যেগুলোর plaintext amount আছে কিন্তু
       encrypted amount এখনো নেই।
    ====================================================== */

    const transactions =
      await Transaction.collection
        .find({
          amount: {
            $exists: true,
          },

          amountEncrypted: {
            $exists: false,
          },
        })
        .toArray();

    console.log(
      `Found ${transactions.length} transactions to migrate`
    );

    let migrated = 0;
    let skipped = 0;
    let failed = 0;

    /* =====================================================
       MIGRATE ONE BY ONE
    ====================================================== */

    for (
      const transaction of transactions
    ) {
      try {
        const amount =
          Number(
            transaction.amount
          );

        /* =================================================
           VALIDATE OLD AMOUNT
        ================================================== */

        if (
          !Number.isFinite(
            amount
          ) ||
          amount <= 0
        ) {
          console.log(
            `⚠️ Skipped ${transaction._id}: invalid amount`
          );

          skipped++;

          continue;
        }

        /* =================================================
           CONVERT TO POISHA
        ================================================== */

        const minorUnits =
          toMinorUnits(
            amount
          );

        if (
          !Number.isSafeInteger(
            minorUnits
          ) ||
          minorUnits <= 0
        ) {
          console.log(
            `⚠️ Skipped ${transaction._id}: invalid minor-unit amount`
          );

          skipped++;

          continue;
        }

        /* =================================================
           ENCRYPT

           String হিসেবে encrypt করছি।
           Example:
           "50000"
        ================================================== */

        const amountEncrypted =
          encryptData(
            String(
              minorUnits
            )
          );

        /* =================================================
           UPDATE DOCUMENT

           plaintext amount এখনো remove করছি না।
        ================================================== */

        await Transaction.collection.updateOne(
          {
            _id:
              transaction._id,

            amountEncrypted: {
              $exists: false,
            },
          },
          {
            $set: {
              amountEncrypted,
            },
          }
        );

        migrated++;

        console.log(
          `✅ Migrated transaction: ${transaction._id}`
        );
      } catch (error) {
        failed++;

        console.error(
          `❌ Failed transaction ${transaction._id}:`,
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
      "\n========== TRANSACTION AMOUNT MIGRATION =========="
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
      "=================================================="
    );

    if (failed === 0) {
      console.log(
        "✅ Transaction amount migration completed."
      );
    }
  } catch (error) {
    console.error(
      "MIGRATION ERROR:",
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

void migrateTransactionAmounts();