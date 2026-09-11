"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const mongoose_1 = __importDefault(require("mongoose"));
const db_js_1 = __importDefault(require("../config/db.js"));
const crypto_js_1 = require("../utils/crypto.js");
/* =========================================================
   SCRIPT MODE

   Default:
   npx tsx src/scripts/migrateUserPII.ts
   -> Dry run only

   Apply:
   npx tsx src/scripts/migrateUserPII.ts --apply
   -> Writes encrypted fields into MongoDB
========================================================= */
const APPLY_CHANGES = process.argv.includes("--apply");
/* =========================================================
   HELPERS
========================================================= */
function isEncryptedData(value) {
    if (!value ||
        typeof value !==
            "object") {
        return false;
    }
    const candidate = value;
    return (typeof candidate.encrypted ===
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
            0);
}
function hasMigrationChanges(fields) {
    return (fields.emailEncrypted !==
        undefined ||
        fields.emailLookup !==
            undefined ||
        fields.phoneEncrypted !==
            undefined ||
        fields.phoneLookup !==
            undefined);
}
function isDuplicateKeyError(error) {
    return (error instanceof
        mongoose_1.default.mongo
            .MongoServerError &&
        error.code === 11000);
}
/* =========================================================
   BUILD UPDATE FIELDS
========================================================= */
function buildMigrationFields(user, stats) {
    const fields = {};
    /* -------------------------------------------------------
       EMAIL MIGRATION
    ------------------------------------------------------- */
    if (typeof user.email ===
        "string" &&
        user.email.trim()) {
        const normalizedEmail = (0, crypto_js_1.normalizeEmail)(user.email);
        if (!normalizedEmail) {
            stats.invalidEmail += 1;
        }
        else {
            if (!isEncryptedData(user.emailEncrypted)) {
                fields.emailEncrypted =
                    (0, crypto_js_1.encryptData)(normalizedEmail);
            }
            if (typeof user.emailLookup !==
                "string" ||
                !user.emailLookup.trim()) {
                fields.emailLookup =
                    (0, crypto_js_1.createLookupHash)(normalizedEmail);
            }
        }
    }
    /* -------------------------------------------------------
       PHONE MIGRATION
    ------------------------------------------------------- */
    if (typeof user.phone ===
        "string" &&
        user.phone.trim()) {
        const normalizedPhone = (0, crypto_js_1.normalizePhone)(user.phone);
        if (!normalizedPhone) {
            stats.invalidPhone += 1;
        }
        else {
            if (!isEncryptedData(user.phoneEncrypted)) {
                fields.phoneEncrypted =
                    (0, crypto_js_1.encryptData)(normalizedPhone);
            }
            if (typeof user.phoneLookup !==
                "string" ||
                !user.phoneLookup.trim()) {
                fields.phoneLookup =
                    (0, crypto_js_1.createLookupHash)(normalizedPhone);
            }
        }
    }
    return fields;
}
/* =========================================================
   MIGRATION
========================================================= */
async function migrateUserPII() {
    const stats = {
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
        console.log("Connecting to database...");
        await (0, db_js_1.default)();
        const database = mongoose_1.default.connection.db;
        if (!database) {
            throw new Error("MongoDB connection is unavailable.");
        }
        console.log("Database connected.");
        /*
         * User.find() ব্যবহার করা হচ্ছে না, কারণ বর্তমান
         * IUser type-এ legacy plaintext email/phone নেই।
         */
        const users = database.collection("users");
        const cursor = users.find({}, {
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
        });
        console.log(APPLY_CHANGES
            ? "User PII migration running in APPLY mode."
            : "User PII migration running in DRY-RUN mode.");
        /* =====================================================
           PROCESS USERS
        ====================================================== */
        for await (const user of cursor) {
            stats.scanned += 1;
            let fields;
            try {
                fields =
                    buildMigrationFields(user, stats);
            }
            catch (error) {
                stats.failed += 1;
                console.error(`Unable to prepare user ${user._id.toString()}:`, error instanceof Error
                    ? error.message
                    : "Unknown migration error.");
                continue;
            }
            if (!hasMigrationChanges(fields)) {
                stats.skipped += 1;
                continue;
            }
            stats.pendingChanges += 1;
            /* ===================================================
               DRY RUN
            =================================================== */
            if (!APPLY_CHANGES) {
                console.log(`[DRY RUN] User ${user._id.toString()} requires PII migration.`);
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
                const updateFields = {
                    ...fields,
                    updatedAt: new Date(),
                };
                const result = await users.updateOne({
                    _id: user._id,
                }, {
                    $set: updateFields,
                });
                if (result.modifiedCount >
                    0) {
                    stats.modified += 1;
                    console.log(`Migrated user ${user._id.toString()}.`);
                }
                else {
                    stats.skipped += 1;
                }
            }
            catch (error) {
                if (isDuplicateKeyError(error)) {
                    stats.duplicate += 1;
                    console.error(`Skipped user ${user._id.toString()}: normalized email or phone already belongs to another account.`);
                    continue;
                }
                stats.failed += 1;
                console.error(`Failed user ${user._id.toString()}:`, error instanceof Error
                    ? error.message
                    : "Unknown database error.");
            }
        }
        /* =====================================================
           RESULT
        ====================================================== */
        console.log("\n========== USER PII MIGRATION ==========");
        console.log(`Mode: ${APPLY_CHANGES
            ? "APPLY"
            : "DRY RUN"}`);
        console.log(`Scanned: ${stats.scanned}`);
        console.log(`Pending changes: ${stats.pendingChanges}`);
        console.log(`Modified: ${stats.modified}`);
        console.log(`Skipped: ${stats.skipped}`);
        console.log(`Invalid email: ${stats.invalidEmail}`);
        console.log(`Invalid phone: ${stats.invalidPhone}`);
        console.log(`Duplicate: ${stats.duplicate}`);
        console.log(`Failed: ${stats.failed}`);
        console.log("========================================");
        if (!APPLY_CHANGES) {
            console.log("Dry run completed. No database records were modified.");
            console.log("Review the result, take a database backup, then run again with --apply.");
        }
        /*
         * Plaintext email এবং phone এই migration থেকে
         * delete করা হচ্ছে না। verifyUserPII.ts সফল হওয়ার
         * পরেই removeLegacyUserPII.ts চালাতে হবে।
         */
    }
    finally {
        await mongoose_1.default.disconnect();
        console.log("Database disconnected.");
    }
}
/* =========================================================
   RUN
========================================================= */
void migrateUserPII().catch((error) => {
    console.error("USER PII MIGRATION FAILED:", error instanceof Error
        ? error.message
        : error);
    process.exitCode = 1;
});
