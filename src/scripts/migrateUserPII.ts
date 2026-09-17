import "dotenv/config";

import mongoose from "mongoose";

import connectDB from "../config/db.js";

import type {
  IEncryptedData,
} from "../models/User.js";

import {
  createLookupHash,
  encryptData,
  normalizeEmail,
  normalizePhone,
} from "../utils/crypto.js";

/* =========================================================
   LEGACY USER TYPES

   Current IUser intentionally does not contain plaintext
   email and phone. Therefore, this migration uses the raw
   MongoDB users collection with a local legacy type.
========================================================= */

interface LegacyUserRecord {
  [key: string]: unknown;

  _id: mongoose.Types.ObjectId;

  email?: string;
  phone?: string;

  emailEncrypted?: IEncryptedData;
  emailLookup?: string;

  phoneEncrypted?: IEncryptedData;
  phoneLookup?: string;

  updatedAt?: Date;
}
interface MigrationSetFields {
  /*
   * MongoDB $set operator expects an object supporting
   * arbitrary string field names.
   */
  [key: string]: unknown;

  emailEncrypted?: IEncryptedData;
  emailLookup?: string;

  phoneEncrypted?: IEncryptedData;
  phoneLookup?: string;

  updatedAt?: Date;
}

interface MigrationStats {
  scanned: number;
  pendingChanges: number;
  modified: number;
  skipped: number;
  invalidEmail: number;
  invalidPhone: number;
  duplicate: number;
  failed: number;
}

/* =========================================================
   SCRIPT MODE

   Default:
   npx tsx src/scripts/migrateUserPII.ts
   -> Dry run only

   Apply:
   npx tsx src/scripts/migrateUserPII.ts --apply
   -> Writes encrypted fields into MongoDB
========================================================= */

const APPLY_CHANGES =
  process.argv.includes(
    "--apply"
  );

/* =========================================================
   HELPERS
========================================================= */

function isEncryptedData(
  value: unknown
): value is IEncryptedData {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return false;
  }

  const candidate =
    value as Partial<IEncryptedData>;

  return (
    typeof candidate.encrypted ===
      "string" &&
    candidate.encrypted.length >
      0 &&
    typeof candidate.iv ===
      "string" &&
    candidate.iv.length >
      0 &&
    typeof candidate.authTag ===
      "string" &&
    candidate.authTag.length >
      0
  );
}

function hasMigrationChanges(
  fields: MigrationSetFields
): boolean {
  return (
    fields.emailEncrypted !==
      undefined ||
    fields.emailLookup !==
      undefined ||
    fields.phoneEncrypted !==
      undefined ||
    fields.phoneLookup !==
      undefined
  );
}

function isDuplicateKeyError(
  error: unknown
): boolean {
  return (
    error instanceof
      mongoose.mongo
        .MongoServerError &&
    error.code === 11000
  );
}

/* =========================================================
   BUILD UPDATE FIELDS
========================================================= */

function buildMigrationFields(
  user: LegacyUserRecord,
  stats: MigrationStats
): MigrationSetFields {
  const fields:
    MigrationSetFields = {};

  /* -------------------------------------------------------
     EMAIL MIGRATION
  ------------------------------------------------------- */

  if (
    typeof user.email ===
      "string" &&
    user.email.trim()
  ) {
    const normalizedEmail =
      normalizeEmail(
        user.email
      );

    if (!normalizedEmail) {
      stats.invalidEmail += 1;
    } else {
      if (
        !isEncryptedData(
          user.emailEncrypted
        )
      ) {
        fields.emailEncrypted =
          encryptData(
            normalizedEmail
          );
      }

      if (
        typeof user.emailLookup !==
          "string" ||
        !user.emailLookup.trim()
      ) {
        fields.emailLookup =
          createLookupHash(
            normalizedEmail
          );
      }
    }
  }

  /* -------------------------------------------------------
     PHONE MIGRATION
  ------------------------------------------------------- */

  if (
    typeof user.phone ===
      "string" &&
    user.phone.trim()
  ) {
    const normalizedPhone =
      normalizePhone(
        user.phone
      );

    if (!normalizedPhone) {
      stats.invalidPhone += 1;
    } else {
      if (
        !isEncryptedData(
          user.phoneEncrypted
        )
      ) {
        fields.phoneEncrypted =
          encryptData(
            normalizedPhone
          );
      }

      if (
        typeof user.phoneLookup !==
          "string" ||
        !user.phoneLookup.trim()
      ) {
        fields.phoneLookup =
          createLookupHash(
            normalizedPhone
          );
      }
    }
  }

  return fields;
}

/* =========================================================
   MIGRATION
========================================================= */

async function migrateUserPII():
  Promise<void> {
  const stats: MigrationStats = {
    scanned: 0,
    pendingChanges: 0,
    modified: 0,
    skipped: 0,
    invalidEmail: 0,
    invalidPhone: 0,
    duplicate: 0,
    failed: 0,
  };

  try {
    console.log(
      "Connecting to database..."
    );

    await connectDB();

    const database =
      mongoose.connection.db;

    if (!database) {
      throw new Error(
        "MongoDB connection is unavailable."
      );
    }

    console.log(
      "Database connected."
    );

    /*
     * User.find() ব্যবহার করা হচ্ছে না, কারণ বর্তমান
     * IUser type-এ legacy plaintext email/phone নেই।
     */
    const users =
      database.collection<LegacyUserRecord>(
        "users"
      );

    const cursor =
      users.find(
        {},
        {
          projection: {
            _id: 1,

            email: 1,
            phone: 1,

            emailEncrypted: 1,
            emailLookup: 1,

            phoneEncrypted: 1,
            phoneLookup: 1,

            updatedAt: 1,
          },
        }
      );

    console.log(
      APPLY_CHANGES
        ? "User PII migration running in APPLY mode."
        : "User PII migration running in DRY-RUN mode."
    );

    /* =====================================================
       PROCESS USERS
    ====================================================== */

    for await (
      const user of cursor
    ) {
      stats.scanned += 1;

      let fields:
        MigrationSetFields;

      try {
        fields =
          buildMigrationFields(
            user,
            stats
          );
      } catch (error) {
        stats.failed += 1;

        console.error(
          `Unable to prepare user ${user._id.toString()}:`,
          error instanceof Error
            ? error.message
            : "Unknown migration error."
        );

        continue;
      }

      if (
        !hasMigrationChanges(
          fields
        )
      ) {
        stats.skipped += 1;
        continue;
      }

      stats.pendingChanges += 1;

      /* ===================================================
         DRY RUN
      =================================================== */

      if (!APPLY_CHANGES) {
        console.log(
          `[DRY RUN] User ${user._id.toString()} requires PII migration.`
        );

        continue;
      }

      /* ===================================================
         APPLY UPDATE
      =================================================== */

      try {
        /*
         * updatedAt সরাসরি $set-এর মধ্যে দেওয়া হয়েছে।
         * এটি MongoDB driver-এর $currentDate `never`
         * TypeScript error এড়ায়।
         */
        const updateFields:
          MigrationSetFields = {
          ...fields,
          updatedAt:
            new Date(),
        };

        const result =
          await users.updateOne(
            {
              _id:
                user._id,
            },
            {
              $set:
                updateFields,
            }
          );

        if (
          result.modifiedCount >
          0
        ) {
          stats.modified += 1;

          console.log(
            `Migrated user ${user._id.toString()}.`
          );
        } else {
          stats.skipped += 1;
        }
      } catch (error) {
        if (
          isDuplicateKeyError(
            error
          )
        ) {
          stats.duplicate += 1;

          console.error(
            `Skipped user ${user._id.toString()}: normalized email or phone already belongs to another account.`
          );

          continue;
        }

        stats.failed += 1;

        console.error(
          `Failed user ${user._id.toString()}:`,
          error instanceof Error
            ? error.message
            : "Unknown database error."
        );
      }
    }

    /* =====================================================
       RESULT
    ====================================================== */

    console.log(
      "\n========== USER PII MIGRATION =========="
    );

    console.log(
      `Mode: ${
        APPLY_CHANGES
          ? "APPLY"
          : "DRY RUN"
      }`
    );

    console.log(
      `Scanned: ${stats.scanned}`
    );

    console.log(
      `Pending changes: ${stats.pendingChanges}`
    );

    console.log(
      `Modified: ${stats.modified}`
    );

    console.log(
      `Skipped: ${stats.skipped}`
    );

    console.log(
      `Invalid email: ${stats.invalidEmail}`
    );

    console.log(
      `Invalid phone: ${stats.invalidPhone}`
    );

    console.log(
      `Duplicate: ${stats.duplicate}`
    );

    console.log(
      `Failed: ${stats.failed}`
    );

    console.log(
      "========================================"
    );

    if (!APPLY_CHANGES) {
      console.log(
        "Dry run completed. No database records were modified."
      );

      console.log(
        "Review the result, take a database backup, then run again with --apply."
      );
    }

    /*
     * Plaintext email এবং phone এই migration থেকে
     * delete করা হচ্ছে না। verifyUserPII.ts সফল হওয়ার
     * পরেই removeLegacyUserPII.ts চালাতে হবে।
     */
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

void migrateUserPII().catch(
  (error: unknown) => {
    console.error(
      "USER PII MIGRATION FAILED:",
      error instanceof Error
        ? error.message
        : error
    );

    process.exitCode = 1;
  }
);