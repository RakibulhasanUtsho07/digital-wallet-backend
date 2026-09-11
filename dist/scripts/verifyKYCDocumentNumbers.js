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
const normalizeDocumentNumber = (value) => {
    return value
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "");
};
async function verify() {
    await (0, db_js_1.default)();
    const records = await KYC_js_1.KYC.find({
        documentNumber: {
            $exists: true,
            $type: "string",
            $ne: "",
        },
    }).select("_id documentNumber documentNumberEncrypted documentNumberLookup");
    let verified = 0;
    let missingSecureFields = 0;
    let mismatch = 0;
    let failed = 0;
    for (const record of records) {
        try {
            if (!record.documentNumberEncrypted ||
                !record.documentNumberLookup) {
                missingSecureFields += 1;
                continue;
            }
            const legacy = normalizeDocumentNumber(record.documentNumber || "");
            const decrypted = (0, crypto_js_1.decryptData)(record.documentNumberEncrypted);
            const expectedLookup = (0, crypto_js_1.createLookupHash)(legacy);
            if (decrypted !== legacy ||
                record.documentNumberLookup !==
                    expectedLookup) {
                mismatch += 1;
                continue;
            }
            verified += 1;
        }
        catch (error) {
            failed += 1;
            console.error(`Verification failed for KYC record ${record._id.toString()}.`, error instanceof Error
                ? error.message
                : error);
        }
    }
    const totalKYC = await KYC_js_1.KYC.countDocuments();
    const secureKYC = await KYC_js_1.KYC.countDocuments({
        documentNumberEncrypted: {
            $exists: true,
        },
        documentNumberLookup: {
            $exists: true,
            $type: "string",
        },
    });
    console.log("KYC document-number verification complete.");
    console.log(`Total KYC records: ${totalKYC}`);
    console.log(`Secure document-number records: ${secureKYC}`);
    console.log(`Legacy records checked: ${records.length}`);
    console.log(`Verified: ${verified}`);
    console.log(`Missing secure fields: ${missingSecureFields}`);
    console.log(`Mismatch: ${mismatch}`);
    console.log(`Failed: ${failed}`);
    if (missingSecureFields > 0 ||
        mismatch > 0 ||
        failed > 0) {
        process.exitCode = 1;
    }
}
verify()
    .catch((error) => {
    console.error("KYC document-number verification failed:", error);
    process.exitCode = 1;
})
    .finally(async () => {
    await mongoose_1.default.connection.close();
});
