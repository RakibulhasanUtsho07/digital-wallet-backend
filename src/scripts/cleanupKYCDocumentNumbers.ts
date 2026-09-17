import "dotenv/config";
import mongoose from "mongoose";

import connectDB from "../config/db.js";
import { KYC } from "../models/KYC.js";
import {
  createLookupHash,
  decryptData,
} from "../utils/crypto.js";

/* =========================================================
   NORMALIZE DOCUMENT NUMBER

   Must remain compatible with the migration/controller logic.
========================================================= */

const normalizeDocumentNumber = (
  value: string
): string => {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");
};

/* =========================================================
   CLEANUP

   Removes legacy plaintext documentNumber ONLY after:
   - encrypted data exists
   - lookup HMAC exists
   - encrypted value decrypts successfully
   - decrypted value matches legacy plaintext
   - lookup HMAC matches the normalized value

   A record that fails verification is NOT modified.
========================================================= */

async function cleanup(): Promise<void> {
  await connectDB();

  const records =
    await KYC.find({
      documentNumber: {
        $exists: true,
        $type: "string",
        $ne: "",
      },
    }).select(
      "_id documentNumber documentNumberEncrypted documentNumberLookup"
    );

  let cleaned = 0;
  let skipped = 0;
  let failed = 0;

  console.log(
    `Found ${records.length} legacy plaintext KYC document number record(s).`
  );

  for (const record of records) {
    try {
      if (
        !record.documentNumberEncrypted ||
        !record.documentNumberLookup
      ) {
        skipped += 1;

        console.warn(
          `Skipped ${record._id.toString()}: secure fields are missing.`
        );

        continue;
      }

      const legacy =
        normalizeDocumentNumber(
          record.documentNumber || ""
        );

      const decrypted =
        decryptData(
          record.documentNumberEncrypted
        );

      const expectedLookup =
        createLookupHash(
          legacy
        );

      if (
        !legacy ||
        decrypted !== legacy ||
        record.documentNumberLookup !==
          expectedLookup
      ) {
        failed += 1;

        console.error(
          `Verification mismatch for ${record._id.toString()}. Plaintext was NOT removed.`
        );

        continue;
      }

      await KYC.collection.updateOne(
        {
          _id: record._id,
        },
        {
          $unset: {
            documentNumber: "",
          },
        }
      );

      cleaned += 1;
    } catch (error) {
      failed += 1;

      console.error(
        `Cleanup failed for KYC record ${record._id.toString()}:`,
        error instanceof Error
          ? error.message
          : error
      );
    }
  }

  console.log(
    "KYC document-number plaintext cleanup complete."
  );
  console.log(`Cleaned: ${cleaned}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);

  if (
    skipped > 0 ||
    failed > 0
  ) {
    process.exitCode = 1;
  }
}

cleanup()
  .catch((error) => {
    console.error(
      "KYC document-number cleanup failed:",
      error
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
