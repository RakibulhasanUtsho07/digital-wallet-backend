import "dotenv/config";
import mongoose from "mongoose";

import connectDB from "../config/db.js";
import { KYC } from "../models/KYC.js";
import {
  createLookupHash,
  decryptData,
} from "../utils/crypto.js";

async function verifyFinal(): Promise<void> {
  await connectDB();

  const totalKYC =
    await KYC.countDocuments();

  /*
   * Any existence of documentNumber means plaintext cleanup
   * is incomplete, even if the stored string is empty.
   */
  const plaintextRemaining =
    await KYC.collection.countDocuments({
      documentNumber: {
        $exists: true,
      },
    });

  const secureRecords =
    await KYC.find({
      documentNumberEncrypted: {
        $exists: true,
      },

      documentNumberLookup: {
        $exists: true,
        $type: "string",
        $ne: "",
      },
    }).select(
      "_id documentNumberEncrypted documentNumberLookup"
    );

  const partialSecureFields =
    await KYC.collection.countDocuments({
      $or: [
        {
          documentNumberEncrypted: {
            $exists: true,
          },

          documentNumberLookup: {
            $exists: false,
          },
        },

        {
          documentNumberEncrypted: {
            $exists: false,
          },

          documentNumberLookup: {
            $exists: true,
          },
        },
      ],
    });

  let verifiedSecureRecords = 0;
  let lookupMismatch = 0;
  let decryptFailed = 0;

  for (const record of secureRecords) {
    try {
      if (
        !record.documentNumberEncrypted ||
        !record.documentNumberLookup
      ) {
        lookupMismatch += 1;
        continue;
      }

      const decrypted =
        decryptData(
          record.documentNumberEncrypted
        );

      const expectedLookup =
        createLookupHash(
          decrypted
        );

      if (
        expectedLookup !==
        record.documentNumberLookup
      ) {
        lookupMismatch += 1;
        continue;
      }

      verifiedSecureRecords += 1;
    } catch (error) {
      decryptFailed += 1;

      console.error(
        `Secure verification failed for KYC record ${record._id.toString()}:`,
        error instanceof Error
          ? error.message
          : error
      );
    }
  }

  console.log(
    "Final KYC document-number security verification complete."
  );
  console.log(
    `Total KYC records: ${totalKYC}`
  );
  console.log(
    `Secure document-number records: ${secureRecords.length}`
  );
  console.log(
    `Verified secure records: ${verifiedSecureRecords}`
  );
  console.log(
    `Plaintext documentNumber fields remaining: ${plaintextRemaining}`
  );
  console.log(
    `Partial secure-field records: ${partialSecureFields}`
  );
  console.log(
    `Lookup mismatch: ${lookupMismatch}`
  );
  console.log(
    `Decrypt failed: ${decryptFailed}`
  );

  if (
    plaintextRemaining > 0 ||
    partialSecureFields > 0 ||
    lookupMismatch > 0 ||
    decryptFailed > 0
  ) {
    process.exitCode = 1;
  }
}

verifyFinal()
  .catch((error) => {
    console.error(
      "Final KYC document-number verification failed:",
      error
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
