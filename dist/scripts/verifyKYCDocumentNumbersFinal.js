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
async function verifyFinal() {
    await (0, db_js_1.default)();
    const totalKYC = await KYC_js_1.KYC.countDocuments();
    /*
     * Any existence of documentNumber means plaintext cleanup
     * is incomplete, even if the stored string is empty.
     */
    const plaintextRemaining = await KYC_js_1.KYC.collection.countDocuments({
        documentNumber: {
            $exists: true,
        },
    });
    const secureRecords = await KYC_js_1.KYC.find({
        documentNumberEncrypted: {
            $exists: true,
        },
        documentNumberLookup: {
            $exists: true,
            $type: "string",
            $ne: "",
        },
    }).select("_id documentNumberEncrypted documentNumberLookup");
    const partialSecureFields = await KYC_js_1.KYC.collection.countDocuments({
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
            if (!record.documentNumberEncrypted ||
                !record.documentNumberLookup) {
                lookupMismatch += 1;
                continue;
            }
            const decrypted = (0, crypto_js_1.decryptData)(record.documentNumberEncrypted);
            const expectedLookup = (0, crypto_js_1.createLookupHash)(decrypted);
            if (expectedLookup !==
                record.documentNumberLookup) {
                lookupMismatch += 1;
                continue;
            }
            verifiedSecureRecords += 1;
        }
        catch (error) {
            decryptFailed += 1;
            console.error(`Secure verification failed for KYC record ${record._id.toString()}:`, error instanceof Error
                ? error.message
                : error);
        }
    }
    console.log("Final KYC document-number security verification complete.");
    console.log(`Total KYC records: ${totalKYC}`);
    console.log(`Secure document-number records: ${secureRecords.length}`);
    console.log(`Verified secure records: ${verifiedSecureRecords}`);
    console.log(`Plaintext documentNumber fields remaining: ${plaintextRemaining}`);
    console.log(`Partial secure-field records: ${partialSecureFields}`);
    console.log(`Lookup mismatch: ${lookupMismatch}`);
    console.log(`Decrypt failed: ${decryptFailed}`);
    if (plaintextRemaining > 0 ||
        partialSecureFields > 0 ||
        lookupMismatch > 0 ||
        decryptFailed > 0) {
        process.exitCode = 1;
    }
}
verifyFinal()
    .catch((error) => {
    console.error("Final KYC document-number verification failed:", error);
    process.exitCode = 1;
})
    .finally(async () => {
    await mongoose_1.default.connection.close();
});
