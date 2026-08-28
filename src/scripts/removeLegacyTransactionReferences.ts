import "dotenv/config";

import mongoose from "mongoose";

import {
  Transaction,
} from "../models/Transaction.js";

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
   VALID ENCRYPTED VALUE CHECK
========================================================= */

function hasValidEncryptedReference(
  value: unknown
): boolean {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  const encrypted =
    value as {
      encrypted?: unknown;
      iv?: unknown;
      authTag?: unknown;
    };

  return (
    typeof encrypted.encrypted ===
      "string" &&
    typeof encrypted.iv ===
      "string" &&
    typeof encrypted.authTag ===
      "string"
  );
}

/* =========================================================
   REMOVE LEGACY REFERENCES
========================================================= */

async function removeLegacyTransactionReferences(): Promise<void> {
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

    const legacyTransactions =
      await Transaction.collection
        .find({
          reference: {
            $exists: true,
          },
        })
        .toArray();

    console.log(
      `Legacy plaintext references found: ${legacyTransactions.length}`
    );

    let unsafe = 0;

    /* =====================================================
       SAFETY CHECK
    ====================================================== */

    for (
      const transaction of
      legacyTransactions
    ) {
      const reference =
        typeof transaction.reference ===
          "string"
          ? transaction.reference.trim()
          : "";

      /*
       * Empty reference contains no useful data,
       * so it can safely be removed.
       */
      if (!reference) {
        continue;
      }

      if (
        !hasValidEncryptedReference(
          transaction.referenceEncrypted
        )
      ) {
        unsafe++;

        console.error(
          `❌ Missing encrypted reference: ${transaction._id}`
        );
      }
    }

    if (unsafe > 0) {
      console.error(
        `❌ Cleanup stopped. ${unsafe} transaction(s) are not safely migrated.`
      );

      process.exitCode = 1;

      return;
    }

    /* =====================================================
       REMOVE PLAINTEXT REFERENCES
    ====================================================== */

    const result =
      await Transaction.collection.updateMany(
        {
          reference: {
            $exists: true,
          },
        },
        {
          $unset: {
            reference: "",
          },
        }
      );

    console.log(
      "\n========== TRANSACTION REFERENCE CLEANUP =========="
    );

    console.log(
      `Matched: ${result.matchedCount}`
    );

    console.log(
      `Updated: ${result.modifiedCount}`
    );

    console.log(
      "==================================================="
    );

    /* =====================================================
       FINAL CHECK
    ====================================================== */

    const remaining =
      await Transaction.collection.countDocuments({
        reference: {
          $exists: true,
        },
      });

    if (remaining > 0) {
      console.error(
        `❌ ${remaining} plaintext reference(s) still remain.`
      );

      process.exitCode = 1;

      return;
    }

    console.log(
      "✅ Plaintext transaction references removed."
    );

    console.log(
      "✅ Transaction references are now stored encrypted."
    );
  } catch (
    error: unknown
  ) {
    console.error(
      "REFERENCE CLEANUP ERROR:",
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

void removeLegacyTransactionReferences();