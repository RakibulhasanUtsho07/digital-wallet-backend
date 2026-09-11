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

   Must match kycController.ts.
========================================================= */
const normalizeDocumentNumber = (value) => {
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
async function migrate() {
    await (0, db_js_1.default)();
    const records = await KYC_js_1.KYC.find({
        documentNumber: {
            $exists: true,
            $type: "string",
            $ne: "",
        },
    }).select("_id documentNumber documentNumberEncrypted documentNumberLookup");
    let migrated = 0;
    let skipped = 0;
    let failed = 0;
    console.log(`Found ${records.length} KYC record(s) with legacy document numbers.`);
    for (const record of records) {
        try {
            if (record.documentNumberEncrypted &&
                record.documentNumberLookup) {
                skipped += 1;
                continue;
            }
            const legacy = typeof record.documentNumber ===
                "string"
                ? normalizeDocumentNumber(record.documentNumber)
                : "";
            if (!legacy) {
                skipped += 1;
                continue;
            }
            await KYC_js_1.KYC.updateOne({
                _id: record._id,
            }, {
                $set: {
                    documentNumberEncrypted: (0, crypto_js_1.encryptData)(legacy),
                    documentNumberLookup: (0, crypto_js_1.createLookupHash)(legacy),
                },
            });
            migrated += 1;
        }
        catch (error) {
            failed += 1;
            console.error(`Failed to migrate KYC record ${record._id.toString()}.`, error instanceof Error
                ? error.message
                : error);
        }
    }
    console.log("KYC document-number migration complete.");
    console.log(`Migrated: ${migrated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Failed: ${failed}`);
}
migrate()
    .catch((error) => {
    console.error("KYC document-number migration failed:", error);
    process.exitCode = 1;
})
    .finally(async () => {
    await mongoose_1.default.connection.close();
});
