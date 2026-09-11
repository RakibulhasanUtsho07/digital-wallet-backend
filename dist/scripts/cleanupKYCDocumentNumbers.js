"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const mongoose_1 = __importDefault(require("mongoose"));
const db_js_1 = __importDefault(require("../config/db.js"));
const KYC_js_1 = require("../models/KYC.js");
const crypto_js_1 = require("../utils/crypto.js");
/* =========================================================
   NORMALIZE DOCUMENT NUMBER

   Must remain compatible with the migration/controller logic.
========================================================= */
const normalizeDocumentNumber = (value) => {
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
async function cleanup() {
    await (0, db_js_1.default)();
    const records = await KYC_js_1.KYC.find({
        documentNumber: {
            $exists: true,
            $type: "string",
            $ne: "",
        },
    }).select("_id documentNumber documentNumberEncrypted documentNumberLookup");
    let cleaned = 0;
    let skipped = 0;
    let failed = 0;
    console.log(`Found ${records.length} legacy plaintext KYC document number record(s).`);
    for (const record of records) {
        try {
            if (!record.documentNumberEncrypted ||
                !record.documentNumberLookup) {
                skipped += 1;
                console.warn(`Skipped ${record._id.toString()}: secure fields are missing.`);
                continue;
            }
            const legacy = normalizeDocumentNumber(record.documentNumber || "");
            const decrypted = (0, crypto_js_1.decryptData)(record.documentNumberEncrypted);
            const expectedLookup = (0, crypto_js_1.createLookupHash)(legacy);
            if (!legacy ||
                decrypted !== legacy ||
                record.documentNumberLookup !==
                    expectedLookup) {
                failed += 1;
                console.error(`Verification mismatch for ${record._id.toString()}. Plaintext was NOT removed.`);
                continue;
            }
            await KYC_js_1.KYC.collection.updateOne({
                _id: record._id,
            }, {
                $unset: {
                    documentNumber: "",
                },
            });
            cleaned += 1;
        }
        catch (error) {
            failed += 1;
            console.error(`Cleanup failed for KYC record ${record._id.toString()}:`, error instanceof Error
                ? error.message
                : error);
        }
    }
    console.log("KYC document-number plaintext cleanup complete.");
    console.log(`Cleaned: ${cleaned}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Failed: ${failed}`);
    if (skipped > 0 ||
        failed > 0) {
        process.exitCode = 1;
    }
}
cleanup()
    .catch((error) => {
    console.error("KYC document-number cleanup failed:", error);
    process.exitCode = 1;
})
    .finally(async () => {
    await mongoose_1.default.connection.close();
});
