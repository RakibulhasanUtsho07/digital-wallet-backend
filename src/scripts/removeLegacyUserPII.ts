import "dotenv/config";
import mongoose from "mongoose";

import {
  User,
} from "../models/User.js";

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
   REMOVE LEGACY PLAINTEXT PII
========================================================= */

async function removeLegacyUserPII(): Promise<void> {
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
       SAFETY VERIFICATION
    ====================================================== */

    const totalUsers =
      await User.collection.countDocuments();

    const usersMissingSecureEmail =
      await User.collection.countDocuments({
        $or: [
          {
            emailEncrypted: {
              $exists: false,
            },
          },
          {
            emailLookup: {
              $exists: false,
            },
          },
        ],
      });

    const usersWithPlainPhoneButMissingSecurePhone =
      await User.collection.countDocuments({
        phone: {
          $exists: true,
          $ne: "",
        },

        $or: [
          {
            phoneEncrypted: {
              $exists: false,
            },
          },
          {
            phoneLookup: {
              $exists: false,
            },
          },
        ],
      });

    console.log(
      `Total users: ${totalUsers}`
    );

    console.log(
      `Missing secure email: ${usersMissingSecureEmail}`
    );

    console.log(
      `Missing secure phone: ${usersWithPlainPhoneButMissingSecurePhone}`
    );

    /* =====================================================
       STOP IF MIGRATION IS INCOMPLETE
    ====================================================== */

    if (
      usersMissingSecureEmail > 0 ||
      usersWithPlainPhoneButMissingSecurePhone > 0
    ) {
      throw new Error(
        "PII migration is incomplete. Plaintext fields were NOT removed."
      );
    }

    /* =====================================================
       REMOVE PLAINTEXT EMAIL + PHONE
    ====================================================== */

    const result =
      await User.collection.updateMany(
        {},
        {
          $unset: {
            email: "",
            phone: "",
          },
        }
      );

    /* =====================================================
       RESULT
    ====================================================== */

    console.log(
      "\n========== CLEANUP RESULT =========="
    );

    console.log(
      `Matched: ${result.matchedCount}`
    );

    console.log(
      `Updated: ${result.modifiedCount}`
    );

    console.log(
      "===================================="
    );

    console.log(
      "✅ Plaintext email and phone fields removed."
    );
  } catch (error) {
    console.error(
      "CLEANUP ERROR:",
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

void removeLegacyUserPII();