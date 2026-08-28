import "dotenv/config";
import mongoose from "mongoose";

import { User } from "../models/User.js";

import {
  createLookupHash,
  encryptData,
  normalizeEmail,
  normalizePhone,
} from "../utils/crypto.js";

/* =========================================================
   GET DATABASE URI
========================================================= */

function getDatabaseUri(): string {
  const uri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.MONGO_DB_URI;

  if (!uri) {
    throw new Error(
      "MongoDB connection URI is missing."
    );
  }

  return uri;
}

/* =========================================================
   MIGRATION
========================================================= */

async function migrateUserPII(): Promise<void> {
  try {
    const mongoUri =
      getDatabaseUri();

    console.log(
      "Connecting to database..."
    );

    await mongoose.connect(
      mongoUri
    );

    console.log(
      "✅ Database connected"
    );

    /* =====================================================
       FIND USERS
    ====================================================== */

    const users =
      await User.find({});

    console.log(
      `Found ${users.length} users`
    );

    let migrated = 0;
    let skipped = 0;
    let failed = 0;

    /* =====================================================
       MIGRATE EACH USER
    ====================================================== */

    for (const user of users) {
      try {
        const updates: Record<
          string,
          unknown
        > = {};

        /* =================================================
           EMAIL
        ================================================= */

        if (
          user.email &&
          (
            !user.emailLookup ||
            !user.emailEncrypted
          )
        ) {
          const normalizedEmail =
            normalizeEmail(
              user.email
            );

          if (normalizedEmail) {
            const emailLookup =
              createLookupHash(
                normalizedEmail
              );

            /*
             * Check that another user
             * doesn't already own this lookup.
             */
            const existingEmail =
              await User.findOne({
                _id: {
                  $ne:
                    user._id,
                },

                emailLookup,
              });

            if (existingEmail) {
              throw new Error(
                "Duplicate normalized email detected."
              );
            }

            updates.emailLookup =
              emailLookup;

            updates.emailEncrypted =
              encryptData(
                normalizedEmail
              );
          }
        }

        /* =================================================
           PHONE
        ================================================= */

        if (
          user.phone &&
          (
            !user.phoneLookup ||
            !user.phoneEncrypted
          )
        ) {
          const normalizedPhone =
            normalizePhone(
              user.phone
            );

          if (normalizedPhone) {
            const phoneLookup =
              createLookupHash(
                normalizedPhone
              );

            const existingPhone =
              await User.findOne({
                _id: {
                  $ne:
                    user._id,
                },

                phoneLookup,
              });

            if (existingPhone) {
              throw new Error(
                "Duplicate normalized phone detected."
              );
            }

            updates.phoneLookup =
              phoneLookup;

            updates.phoneEncrypted =
              encryptData(
                normalizedPhone
              );
          }
        }

        /* =================================================
           NOTHING TO MIGRATE
        ================================================= */

        if (
          Object.keys(
            updates
          ).length === 0
        ) {
          skipped++;

          continue;
        }

        /* =================================================
           UPDATE USER
        ================================================= */

        await User.updateOne(
          {
            _id:
              user._id,
          },
          {
            $set:
              updates,
          }
        );

        migrated++;

        /*
         * Deliberately don't print
         * email / phone to terminal.
         */
        console.log(
          `✅ Migrated user ${user._id.toString()}`
        );
      } catch (error) {
        failed++;

        console.error(
          `❌ Failed user ${user._id.toString()}:`,
          error instanceof Error
            ? error.message
            : "Unknown error"
        );
      }
    }

    /* =====================================================
       RESULT
    ====================================================== */

    console.log(
      "\n========== MIGRATION RESULT =========="
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
      "======================================"
    );
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

void migrateUserPII();