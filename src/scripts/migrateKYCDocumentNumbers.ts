import "dotenv/config";
import mongoose from "mongoose";

import connectDB from "../config/db.js";
import { KYC } from "../models/KYC.js";
import {
  createLookupHash,
  encryptData,
} from "../utils/crypto.js";

/* =========================================================
   NORMALIZE DOCUMENT NUMBER

   Must match kycController.ts.
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
   MIGRATION

   Stage 1 only:
   - reads legacy plaintext documentNumber
   - writes documentNumberEncrypted
   - writes documentNumberLookup
   - DOES NOT delete documentNumber yet
========================================================= */

async function migrate(): Promise<void> {
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

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  console.log(
    `Found ${records.length} KYC record(s) with legacy document numbers.`
  );

  for (const record of records) {
    try {
      if (
        record.documentNumberEncrypted &&
        record.documentNumberLookup
      ) {
        skipped += 1;
        continue;
      }

      const legacy =
        typeof record.documentNumber ===
          "string"
          ? normalizeDocumentNumber(
              record.documentNumber
            )
          : "";

      if (!legacy) {
        skipped += 1;
        continue;
      }

      await KYC.updateOne(
        {
          _id: record._id,
        },
        {
          $set: {
            documentNumberEncrypted:
              encryptData(
                legacy
              ),

            documentNumberLookup:
              createLookupHash(
                legacy
              ),
          },
        }
      );

      migrated += 1;
    } catch (error) {
      failed += 1;

      console.error(
        `Failed to migrate KYC record ${record._id.toString()}.`,
        error instanceof Error
          ? error.message
          : error
      );
    }
  }

  console.log("KYC document-number migration complete.");
  console.log(`Migrated: ${migrated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

migrate()
  .catch((error) => {
    console.error(
      "KYC document-number migration failed:",
      error
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
