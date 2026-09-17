import "dotenv/config";

import mongoose from "mongoose";

import {
  Transaction,
} from "../models/Transaction.js";

import {
  decryptData,
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
   VERIFY TRANSACTION AMOUNTS
========================================================= */

async function verifyTransactionAmounts(): Promise<void> {
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

    const transactions =
      await Transaction.collection
        .find({})
        .toArray();

    let verified = 0;
    let missingEncryptedAmount = 0;
    let mismatch = 0;
    let failed = 0;

    /* =====================================================
       VERIFY EACH TRANSACTION
    ====================================================== */

    for (const transaction of transactions) {
      try {
        const encrypted =
          transaction.amountEncrypted;

        if (!encrypted) {
          missingEncryptedAmount++;

          console.log(
            `⚠️ Missing encrypted amount: ${transaction._id}`
          );

          continue;
        }

        /* =================================================
           DECRYPT STORED VALUE
        ================================================== */

        const decryptedValue =
          decryptData({
            encrypted:
              encrypted.encrypted,

            iv:
              encrypted.iv,

            authTag:
              encrypted.authTag,
          });

        const decryptedMinorUnits =
          Number(
            decryptedValue
          );

        if (
          !Number.isSafeInteger(
            decryptedMinorUnits
          )
        ) {
          failed++;

          console.log(
            `❌ Invalid decrypted amount: ${transaction._id}`
          );

          continue;
        }

        /* =================================================
           COMPARE WITH OLD PLAINTEXT AMOUNT
        ================================================== */

        if (
          typeof transaction.amount ===
          "number"
        ) {
          const expectedMinorUnits =
            Math.round(
              transaction.amount *
                100
            );

          if (
            expectedMinorUnits !==
            decryptedMinorUnits
          ) {
            mismatch++;

            console.log(
              `❌ Amount mismatch: ${transaction._id}`
            );

            continue;
          }
        }

        verified++;

        console.log(
          `✅ Verified transaction: ${transaction._id}`
        );
      } catch (error) {
        failed++;

        console.error(
          `❌ Verification failed ${transaction._id}:`,
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
      "\n========== TRANSACTION AMOUNT VERIFICATION =========="
    );

    console.log(
      `Total transactions: ${transactions.length}`
    );

    console.log(
      `Verified: ${verified}`
    );

    console.log(
      `Missing encrypted amount: ${missingEncryptedAmount}`
    );

    console.log(
      `Mismatch: ${mismatch}`
    );

    console.log(
      `Failed: ${failed}`
    );

    console.log(
      "====================================================="
    );

    if (
      missingEncryptedAmount === 0 &&
      mismatch === 0 &&
      failed === 0
    ) {
      console.log(
        "✅ All transaction amounts are securely encrypted and verified."
      );

      console.log(
        "✅ Safe to continue with controller migration."
      );
    } else {
      console.log(
        "⚠️ Do NOT remove plaintext amount yet."
      );

      process.exitCode = 1;
    }
  } catch (error) {
    console.error(
      "VERIFICATION ERROR:",
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

void verifyTransactionAmounts();