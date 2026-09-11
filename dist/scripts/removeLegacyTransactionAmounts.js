"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const mongoose_1 = __importDefault(require("mongoose"));
const Transaction_js_1 = require("../models/Transaction.js");
/* =========================================================
   DATABASE URI
========================================================= */
function getMongoUri() {
    const uri = process.env.MONGODB_URI ||
        process.env.MONGO_URI ||
        process.env.MONGO_DB_URI;
    if (!uri) {
        throw new Error("MongoDB URI is missing.");
    }
    return uri;
}
/* =========================================================
   REMOVE LEGACY PLAINTEXT AMOUNTS
========================================================= */
async function removeLegacyTransactionAmounts() {
    try {
        console.log("Connecting to database...");
        await mongoose_1.default.connect(getMongoUri());
        console.log("✅ Database connected");
        /* =====================================================
           SAFETY CHECK
        ====================================================== */
        const totalTransactions = await Transaction_js_1.Transaction.collection.countDocuments();
        const missingEncryptedAmount = await Transaction_js_1.Transaction.collection.countDocuments({
            $or: [
                {
                    amountEncrypted: {
                        $exists: false,
                    },
                },
                {
                    amountEncrypted: null,
                },
            ],
        });
        console.log(`Total transactions: ${totalTransactions}`);
        console.log(`Missing encrypted amount: ${missingEncryptedAmount}`);
        if (missingEncryptedAmount !== 0) {
            console.error("❌ Cleanup stopped.");
            console.error("Some transactions do not have amountEncrypted.");
            process.exitCode = 1;
            return;
        }
        /* =====================================================
           COUNT PLAINTEXT AMOUNTS
        ====================================================== */
        const legacyCount = await Transaction_js_1.Transaction.collection.countDocuments({
            amount: {
                $exists: true,
            },
        });
        console.log(`Legacy plaintext amounts found: ${legacyCount}`);
        if (legacyCount === 0) {
            console.log("ℹ️ No plaintext transaction amounts remain.");
            return;
        }
        /* =====================================================
           REMOVE PLAINTEXT
        ====================================================== */
        const result = await Transaction_js_1.Transaction.collection.updateMany({
            amount: {
                $exists: true,
            },
            amountEncrypted: {
                $exists: true,
            },
        }, {
            $unset: {
                amount: "",
            },
        });
        console.log("\n========== TRANSACTION AMOUNT CLEANUP ==========");
        console.log(`Matched: ${result.matchedCount}`);
        console.log(`Updated: ${result.modifiedCount}`);
        console.log("===============================================");
        /* =====================================================
           FINAL CHECK
        ====================================================== */
        const remainingPlaintext = await Transaction_js_1.Transaction.collection.countDocuments({
            amount: {
                $exists: true,
            },
        });
        if (remainingPlaintext !== 0) {
            console.error(`❌ ${remainingPlaintext} plaintext transaction amount(s) remain.`);
            process.exitCode = 1;
            return;
        }
        console.log("✅ Plaintext transaction amounts removed.");
        console.log("✅ All transaction amounts are encrypted.");
    }
    catch (error) {
        console.error("TRANSACTION CLEANUP ERROR:", error instanceof Error
            ? error.message
            : error);
        process.exitCode = 1;
    }
    finally {
        await mongoose_1.default.disconnect();
        console.log("Database disconnected.");
    }
}
void removeLegacyTransactionAmounts();
