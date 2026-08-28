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
   VERIFY USER PII
========================================================= */

async function verifyUserPII(): Promise<void> {
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
       TOTAL USERS
    ====================================================== */

    const totalUsers =
      await User.collection.countDocuments();

    /* =====================================================
       USERS WITH SECURE EMAIL
    ====================================================== */

    const usersWithSecureEmail =
      await User.collection.countDocuments({
        emailEncrypted: {
          $exists: true,
        },

        emailLookup: {
          $exists: true,
        },
      });

    /* =====================================================
       USERS MISSING SECURE EMAIL
    ====================================================== */

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

    /* =====================================================
       USERS WITH PHONE
       BUT MISSING SECURE PHONE
    ====================================================== */

    const usersMissingSecurePhone =
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

    /* =====================================================
       RESULT
    ====================================================== */

    console.log(
      "\n========== PII VERIFICATION =========="
    );

    console.log(
      `Total users: ${totalUsers}`
    );

    console.log(
      `Secure email users: ${usersWithSecureEmail}`
    );

    console.log(
      `Missing secure email: ${usersMissingSecureEmail}`
    );

    console.log(
      `Missing secure phone: ${usersMissingSecurePhone}`
    );

    console.log(
      "======================================"
    );

    /* =====================================================
       SAFETY CHECK
    ====================================================== */

    if (
      usersMissingSecureEmail > 0 ||
      usersMissingSecurePhone > 0
    ) {
      console.log(
        "❌ DO NOT remove plaintext email/phone yet."
      );

      process.exitCode = 1;

      return;
    }

    console.log(
      "✅ All required user PII has been migrated."
    );

    console.log(
      "✅ Safe to continue with plaintext cleanup."
    );
  } catch (error) {
    console.error(
      "VERIFY ERROR:",
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

void verifyUserPII();