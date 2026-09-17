import "dotenv/config";

import mongoose from "mongoose";

import {
  Transaction,
} from "../models/Transaction.js";

import {
  decryptData,
  encryptData,
  type EncryptedData,
} from "../utils/crypto.js";

/* =========================================================
   MODE

   Default:
   DRY RUN

   Apply:
   npx tsx src/scripts/repairTransactionEncryption.ts --apply
========================================================= */

const APPLY_CHANGES =
  process.argv.includes(
    "--apply"
  );

/* =========================================================
   DATABASE
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
   TYPES
========================================================= */

interface LegacyTransactionDocument {
  _id:
    mongoose.Types.ObjectId;

  amount?:
    unknown;

  amountEncrypted?:
    unknown;

  reference?:
    unknown;

  referenceEncrypted?:
    unknown;
}

interface RepairStats {
  total:
    number;

  validAmount:
    number;

  missingAmount:
    number;

  invalidAmount:
    number;

  recoverableAmount:
    number;

  repairedAmount:
    number;

  unrecoverableAmount:
    number;

  validReference:
    number;

  invalidReference:
    number;

  recoverableReference:
    number;

  repairedReference:
    number;

  unrecoverableReference:
    number;

  updatedDocuments:
    number;
}

/* =========================================================
   ENCRYPTED VALUE VALIDATION
========================================================= */

function isEncryptedData(
  value: unknown
): value is EncryptedData {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return false;
  }

  const data =
    value as
      Partial<EncryptedData>;

  return (
    typeof data.encrypted ===
      "string" &&
    data.encrypted.length >
      0 &&
    typeof data.iv ===
      "string" &&
    data.iv.length >
      0 &&
    typeof data.authTag ===
      "string" &&
    data.authTag.length >
      0
  );
}

/* =========================================================
   DECRYPT CHECK
========================================================= */

function canDecrypt(
  value: unknown
): boolean {
  if (
    !isEncryptedData(
      value
    )
  ) {
    return false;
  }

  try {
    decryptData(
      value
    );

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   LEGACY AMOUNT
========================================================= */

function getLegacyMinorUnits(
  value: unknown
): number | null {
  /*
   * Legacy amount was stored as major currency units.
   *
   * Example:
   * 500.25 BDT
   * -> 50025 poisha
   */

  const amount =
    typeof value ===
      "number"
      ? value
      : typeof value ===
          "string" &&
        value.trim()
        ? Number(
            value
          )
        : Number.NaN;

  if (
    !Number.isFinite(
      amount
    ) ||
    amount <=
      0
  ) {
    return null;
  }

  const minorUnits =
    Math.round(
      amount *
        100
    );

  if (
    !Number.isSafeInteger(
      minorUnits
    ) ||
    minorUnits <=
      0
  ) {
    return null;
  }

  return minorUnits;
}

/* =========================================================
   LEGACY REFERENCE
========================================================= */

function getLegacyReference(
  value: unknown
): string | null {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const reference =
    value.trim();

  return reference
    ? reference
    : null;
}

/* =========================================================
   MIGRATION
========================================================= */

async function repairTransactionEncryption(): Promise<void> {
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

    console.log(
      APPLY_CHANGES
        ? "⚠️ APPLY MODE ENABLED"
        : "ℹ️ DRY RUN MODE — database will NOT be modified."
    );

    /* =====================================================
       RAW COLLECTION

       Important:
       Current mongoose schema no longer exposes legacy
       amount/reference fields, therefore use collection.
    ====================================================== */

    const transactions =
      await Transaction.collection
        .find({})
        .toArray() as unknown as
          LegacyTransactionDocument[];

    const stats:
      RepairStats = {
      total:
        transactions.length,

      validAmount:
        0,

      missingAmount:
        0,

      invalidAmount:
        0,

      recoverableAmount:
        0,

      repairedAmount:
        0,

      unrecoverableAmount:
        0,

      validReference:
        0,

      invalidReference:
        0,

      recoverableReference:
        0,

      repairedReference:
        0,

      unrecoverableReference:
        0,

      updatedDocuments:
        0,
    };

    /* =====================================================
       PROCESS
    ====================================================== */

    for (
      const transaction of
      transactions
    ) {
      const setValues:
        Record<
          string,
          unknown
        > = {};

      let needsUpdate =
        false;

      /* ===================================================
         AMOUNT
      =================================================== */

      if (
        canDecrypt(
          transaction.amountEncrypted
        )
      ) {
        stats.validAmount++;

        console.log(
          `✅ AMOUNT OK ${transaction._id}`
        );
      } else {
        if (
          transaction.amountEncrypted
        ) {
          stats.invalidAmount++;

          console.log(
            `❌ INVALID encrypted amount ${transaction._id}`
          );
        } else {
          stats.missingAmount++;

          console.log(
            `⚠️ MISSING encrypted amount ${transaction._id}`
          );
        }

        const legacyMinorUnits =
          getLegacyMinorUnits(
            transaction.amount
          );

        if (
          legacyMinorUnits !==
          null
        ) {
          stats.recoverableAmount++;

          console.log(
            `   ↳ Legacy plaintext amount available. Recoverable.`
          );

          if (
            APPLY_CHANGES
          ) {
            setValues.amountEncrypted =
              encryptData(
                String(
                  legacyMinorUnits
                )
              );

            stats.repairedAmount++;

            needsUpdate =
              true;
          }
        } else {
          stats.unrecoverableAmount++;

          console.log(
            `   ↳ No usable legacy amount. Cannot recover without original encryption key.`
          );
        }
      }

      /* ===================================================
         REFERENCE

         Reference is optional.
      =================================================== */

      if (
        transaction.referenceEncrypted
      ) {
        if (
          canDecrypt(
            transaction.referenceEncrypted
          )
        ) {
          stats.validReference++;

          console.log(
            `✅ REFERENCE OK ${transaction._id}`
          );
        } else {
          stats.invalidReference++;

          console.log(
            `❌ INVALID encrypted reference ${transaction._id}`
          );

          const legacyReference =
            getLegacyReference(
              transaction.reference
            );

          if (
            legacyReference
          ) {
            stats.recoverableReference++;

            console.log(
              `   ↳ Legacy plaintext reference available. Recoverable.`
            );

            if (
              APPLY_CHANGES
            ) {
              setValues.referenceEncrypted =
                encryptData(
                  legacyReference
                );

              stats.repairedReference++;

              needsUpdate =
                true;
            }
          } else {
            stats.unrecoverableReference++;

            console.log(
              `   ↳ No legacy reference. Cannot recover without original encryption key.`
            );
          }
        }
      } else {
        const legacyReference =
          getLegacyReference(
            transaction.reference
          );

        if (
          legacyReference
        ) {
          stats.recoverableReference++;

          console.log(
            `⚠️ Missing encrypted reference ${transaction._id}, legacy reference available.`
          );

          if (
            APPLY_CHANGES
          ) {
            setValues.referenceEncrypted =
              encryptData(
                legacyReference
              );

            stats.repairedReference++;

            needsUpdate =
              true;
          }
        }
      }

      /* ===================================================
         UPDATE

         IMPORTANT:
         Legacy plaintext values are NOT removed here.
      =================================================== */

      if (
        APPLY_CHANGES &&
        needsUpdate
      ) {
        const result =
          await Transaction.collection.updateOne(
            {
              _id:
                transaction._id,
            },
            {
              $set:
                setValues,
            }
          );

        if (
          result.modifiedCount ===
          1
        ) {
          stats.updatedDocuments++;

          console.log(
            `🔧 REPAIRED ${transaction._id}`
          );
        }
      }
    }

    /* =====================================================
       SUMMARY
    ====================================================== */

    console.log(
      "\n===================================================="
    );

    console.log(
      "TRANSACTION ENCRYPTION REPAIR REPORT"
    );

    console.log(
      "===================================================="
    );

    console.log(
      `Mode: ${
        APPLY_CHANGES
          ? "APPLY"
          : "DRY RUN"
      }`
    );

    console.log(
      `Total transactions: ${stats.total}`
    );

    console.log(
      "\n--- AMOUNT ---"
    );

    console.log(
      `Valid encrypted amount: ${stats.validAmount}`
    );

    console.log(
      `Missing encrypted amount: ${stats.missingAmount}`
    );

    console.log(
      `Invalid encrypted amount: ${stats.invalidAmount}`
    );

    console.log(
      `Recoverable from plaintext: ${stats.recoverableAmount}`
    );

    console.log(
      `Repaired amount: ${stats.repairedAmount}`
    );

    console.log(
      `Unrecoverable amount: ${stats.unrecoverableAmount}`
    );

    console.log(
      "\n--- REFERENCE ---"
    );

    console.log(
      `Valid encrypted reference: ${stats.validReference}`
    );

    console.log(
      `Invalid encrypted reference: ${stats.invalidReference}`
    );

    console.log(
      `Recoverable reference: ${stats.recoverableReference}`
    );

    console.log(
      `Repaired reference: ${stats.repairedReference}`
    );

    console.log(
      `Unrecoverable reference: ${stats.unrecoverableReference}`
    );

    console.log(
      "\n--- DATABASE ---"
    );

    console.log(
      `Updated documents: ${stats.updatedDocuments}`
    );

    console.log(
      "===================================================="
    );

    if (
      !APPLY_CHANGES
    ) {
      console.log(
        "\nℹ️ DRY RUN finished."
      );

      console.log(
        "No database records were changed."
      );

      console.log(
        "\nIf the report looks correct, run:"
      );

      console.log(
        "npx tsx src/scripts/repairTransactionEncryption.ts --apply"
      );
    }

    if (
      stats.unrecoverableAmount >
      0
    ) {
      console.log(
        "\n⚠️ Some transaction amounts cannot be recovered from the current database."
      );

      console.log(
        "The original DATA_ENCRYPTION_KEY is required for those records."
      );
    }
  } catch (
    error: unknown
  ) {
    console.error(
      "TRANSACTION ENCRYPTION REPAIR ERROR:",
      error instanceof
        Error
        ? error.message
        : error
    );

    process.exitCode =
      1;
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

void repairTransactionEncryption();