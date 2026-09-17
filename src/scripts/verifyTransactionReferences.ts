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
   VERIFY TRANSACTION REFERENCES
========================================================= */

async function verifyTransactionReferences(): Promise<void> {
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
    let noReference = 0;
    let missingEncryptedReference = 0;
    let mismatch = 0;
    let failed = 0;

    for (
      const transaction of
      transactions
    ) {
      try {
        /* =================================================
           TRANSACTIONS WITHOUT REFERENCE

           reference optional, so this is valid.
        ================================================== */

        const plainReference =
          typeof transaction.reference ===
            "string"
            ? transaction.reference.trim()
            : "";

        const encryptedReference =
          transaction.referenceEncrypted;

        if (
          !plainReference &&
          !encryptedReference
        ) {
          noReference++;

          console.log(
            `ℹ️ No reference: ${transaction._id}`
          );

          continue;
        }

        /* =================================================
           PLAINTEXT EXISTS BUT ENCRYPTED VALUE MISSING
        ================================================== */

        if (
          plainReference &&
          !encryptedReference
        ) {
          missingEncryptedReference++;

          console.log(
            `❌ Missing encrypted reference: ${transaction._id}`
          );

          continue;
        }

        if (
          !encryptedReference ||
          typeof encryptedReference !==
            "object"
        ) {
          failed++;

          console.log(
            `❌ Invalid encrypted reference: ${transaction._id}`
          );

          continue;
        }

        const {
          encrypted,
          iv,
          authTag,
        } = encryptedReference;

        if (
          typeof encrypted !==
            "string" ||
          typeof iv !==
            "string" ||
          typeof authTag !==
            "string"
        ) {
          failed++;

          console.log(
            `❌ Invalid encrypted reference structure: ${transaction._id}`
          );

          continue;
        }

        /* =================================================
           DECRYPT
        ================================================== */

        const decryptedReference =
          decryptData({
            encrypted,
            iv,
            authTag,
          });

        /* =================================================
           COMPARE WITH PLAINTEXT
        ================================================== */

        if (
          plainReference &&
          decryptedReference !==
            plainReference
        ) {
          mismatch++;

          console.log(
            `❌ Reference mismatch: ${transaction._id}`
          );

          continue;
        }

        verified++;

        console.log(
          `✅ Verified reference: ${transaction._id}`
        );
      } catch (
        error: unknown
      ) {
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
      "\n========== TRANSACTION REFERENCE VERIFICATION =========="
    );

    console.log(
      `Total transactions: ${transactions.length}`
    );

    console.log(
      `Verified: ${verified}`
    );

    console.log(
      `No reference: ${noReference}`
    );

    console.log(
      `Missing encrypted reference: ${missingEncryptedReference}`
    );

    console.log(
      `Mismatch: ${mismatch}`
    );

    console.log(
      `Failed: ${failed}`
    );

    console.log(
      "========================================================"
    );

    if (
      missingEncryptedReference ===
        0 &&
      mismatch ===
        0 &&
      failed ===
        0
    ) {
      console.log(
        "✅ All transaction references are securely encrypted and verified."
      );

      console.log(
        "✅ Safe to continue with reference controller migration."
      );
    } else {
      console.log(
        "⚠️ Do NOT remove plaintext references yet."
      );

      process.exitCode = 1;
    }
  } catch (
    error: unknown
  ) {
    console.error(
      "REFERENCE VERIFICATION ERROR:",
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

void verifyTransactionReferences();