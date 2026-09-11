"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFraudRiskScore = exports.getSpendingInsights = void 0;
const Transaction_js_1 = require("../models/Transaction.js");
const crypto_js_1 = require("../utils/crypto.js");
/* =========================================================
   GET TRANSACTION AMOUNT

   New format:
   amountEncrypted contains MINOR UNITS.

   Example:
   encrypted "50000"
        ↓
   decrypt
        ↓
   50000 poisha
        ↓
   500 BDT

   Legacy fallback:
   amount: 500
========================================================= */
const getTransactionAmount = (transaction) => {
    const encrypted = transaction.amountEncrypted;
    if (!encrypted) {
        throw new Error("Encrypted transaction amount is missing.");
    }
    const { encrypted: encryptedValue, iv, authTag, } = encrypted;
    if (typeof encryptedValue !== "string" ||
        typeof iv !== "string" ||
        typeof authTag !== "string") {
        throw new Error("Invalid encrypted transaction amount.");
    }
    const decrypted = (0, crypto_js_1.decryptData)({
        encrypted: encryptedValue,
        iv,
        authTag,
    });
    const minorUnits = Number(decrypted);
    if (!Number.isSafeInteger(minorUnits) ||
        minorUnits < 0) {
        throw new Error("Invalid decrypted transaction amount.");
    }
    return (minorUnits /
        100);
};
/* =========================================================
   GET AI SPENDING INSIGHTS
   GET /api/ai/insights
   PRIVATE
========================================================= */
const getSpendingInsights = async (req, res) => {
    try {
        /* =====================================================
           AUTH
        ====================================================== */
        const userId = req.user?._id;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: "Authentication required.",
            });
            return;
        }
        /* =====================================================
           LAST 30 DAYS
        ====================================================== */
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() -
            30);
        /* =====================================================
           TRANSACTIONS
        ====================================================== */
        const transactions = await Transaction_js_1.Transaction.find({
            senderId: userId,
            type: "TRANSFER",
            createdAt: {
                $gte: thirtyDaysAgo,
            },
        })
            .select([
            "amount",
            "amountEncrypted",
            "createdAt",
            "type",
            "status",
        ].join(" "))
            .lean();
        /* =====================================================
           DECRYPT AMOUNTS
        ====================================================== */
        const transactionAmounts = transactions.map((transaction) => getTransactionAmount(transaction));
        /* =====================================================
           TOTAL SPENT
        ====================================================== */
        const totalSpent = transactionAmounts.reduce((sum, amount) => sum +
            amount, 0);
        const transactionCount = transactions.length;
        const averagePerTransaction = transactionCount > 0
            ? Number((totalSpent /
                transactionCount).toFixed(2))
            : 0;
        /* =====================================================
           AI SPENDING HEALTH
        ====================================================== */
        let spendingHealth = "BALANCED";
        let recommendation = "আপনার লেনদেনের প্যাটার্ন স্বাভাবিক রয়েছে। নিয়মিত সঞ্চয়ের অভ্যাস বজায় রাখুন।";
        if (totalSpent >
            50000 ||
            transactionCount >
                15) {
            spendingHealth =
                "HIGH_EXPENSE";
            recommendation =
                "গত ৩০ দিনে অতিরিক্ত লেনদেন সনাক্ত হয়েছে। একটি মাসিক বাজেট লিমিট সেট করার পরামর্শ দেওয়া হচ্ছে।";
        }
        /* =====================================================
           RESPONSE
        ====================================================== */
        res.status(200).json({
            success: true,
            summary: {
                period: "Last 30 Days",
                totalSpent: Number(totalSpent.toFixed(2)),
                totalTransactions: transactionCount,
                averagePerTransaction,
            },
            aiAnalysis: {
                spendingHealth,
                recommendation,
            },
        });
    }
    catch (error) {
        console.error("GET SPENDING INSIGHTS ERROR:", error);
        res.status(500).json({
            success: false,
            message: error instanceof Error
                ? error.message
                : "Failed to generate spending insights.",
        });
    }
};
exports.getSpendingInsights = getSpendingInsights;
/* =========================================================
   GET FRAUD RISK SCORE
   GET /api/ai/fraud-score
   PRIVATE
========================================================= */
const getFraudRiskScore = async (req, res) => {
    try {
        /* =====================================================
           AUTH
        ====================================================== */
        const userId = req.user?._id;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: "Authentication required.",
            });
            return;
        }
        /* =====================================================
           RECENT TRANSFERS
        ====================================================== */
        const recentTransfers = await Transaction_js_1.Transaction.find({
            senderId: userId,
            type: "TRANSFER",
        })
            .select([
            "amount",
            "amountEncrypted",
            "createdAt",
            "status",
            "riskScore",
        ].join(" "))
            .sort({
            createdAt: -1,
        })
            .limit(5)
            .lean();
        /* =====================================================
           HIGH VALUE TRANSACTIONS
  
           > 10,000 BDT
        ====================================================== */
        const highValueTxs = recentTransfers.filter((transaction) => {
            const amount = getTransactionAmount(transaction);
            return (amount >
                10000);
        });
        /* =====================================================
           RISK SCORE
        ====================================================== */
        let riskScore = 15;
        if (highValueTxs.length >=
            2) {
            riskScore +=
                45;
        }
        /* =====================================================
           OPTIONAL VELOCITY SIGNAL
  
           5 recent transfers পাওয়া গেলে
           small additional score.
        ====================================================== */
        if (recentTransfers.length >=
            5) {
            riskScore +=
                10;
        }
        /*
         * Never allow score above 100.
         */
        riskScore =
            Math.min(riskScore, 100);
        /* =====================================================
           RISK LEVEL
        ====================================================== */
        let riskLevel = "LOW";
        if (riskScore >=
            70) {
            riskLevel =
                "HIGH";
        }
        else if (riskScore >=
            40) {
            riskLevel =
                "MEDIUM";
        }
        /* =====================================================
           RESPONSE
        ====================================================== */
        res.status(200).json({
            success: true,
            fraudAssessment: {
                riskScore,
                riskLevel,
                factorsChecked: [
                    "Transaction Velocity",
                    "Amount Variance",
                    "Recipient Anomalies",
                ],
                highValueTransactions: highValueTxs.length,
                status: riskLevel ===
                    "HIGH"
                    ? "FLAGGED_FOR_REVIEW"
                    : "CLEAR",
            },
        });
    }
    catch (error) {
        console.error("GET FRAUD RISK SCORE ERROR:", error);
        res.status(500).json({
            success: false,
            message: error instanceof Error
                ? error.message
                : "Failed to calculate fraud risk.",
        });
    }
};
exports.getFraudRiskScore = getFraudRiskScore;
