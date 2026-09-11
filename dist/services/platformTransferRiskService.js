"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateTransferPolicy = void 0;
const Transaction_js_1 = require("../models/Transaction.js");
const User_js_1 = require("../models/User.js");
const crypto_js_1 = require("../utils/crypto.js");
const platformSettingsService_js_1 = require("./platformSettingsService.js");
const isEncryptedValue = (value) => {
    if (!value ||
        typeof value !==
            "object") {
        return false;
    }
    const data = value;
    return (typeof data.encrypted ===
        "string" &&
        typeof data.iv ===
            "string" &&
        typeof data.authTag ===
            "string");
};
const getTransactionAmount = (transaction) => {
    if (isEncryptedValue(transaction
        .amountEncrypted)) {
        const minorUnits = Number((0, crypto_js_1.decryptData)(transaction
            .amountEncrypted));
        if (Number.isSafeInteger(minorUnits) &&
            minorUnits >= 0) {
            return (minorUnits /
                100);
        }
        throw new Error("Invalid encrypted transaction amount.");
    }
    /*
     * Temporary legacy fallback only.
     * Remove after plaintext amount cleanup everywhere.
     */
    const legacy = Number(transaction.amount);
    if (Number.isFinite(legacy) &&
        legacy >= 0) {
        return legacy;
    }
    throw new Error("Transaction amount could not be evaluated.");
};
const startOfUtcDay = () => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
};
const evaluateTransferPolicy = async ({ senderId, amount, session, }) => {
    if (!Number.isFinite(amount) ||
        amount <= 0) {
        return {
            allowed: false,
            code: "DAILY_LIMIT_EXCEEDED",
            message: "Invalid transfer amount.",
        };
    }
    const settings = await (0, platformSettingsService_js_1.getOrCreatePlatformSettings)(session);
    const now = new Date();
    const velocityStart = new Date(now.getTime() -
        settings.risk
            .velocityWindowMinutes *
            60 *
            1000);
    const dailyQuery = Transaction_js_1.Transaction.find({
        senderId,
        type: "TRANSFER",
        status: "COMPLETED",
        createdAt: {
            $gte: startOfUtcDay(),
            $lte: now,
        },
    }).select("amountEncrypted amount");
    const velocityQuery = Transaction_js_1.Transaction.countDocuments({
        senderId,
        type: "TRANSFER",
        status: "COMPLETED",
        createdAt: {
            $gte: velocityStart,
            $lte: now,
        },
    });
    if (session) {
        dailyQuery.session(session);
        velocityQuery.session(session);
    }
    const [dailyTransactions, windowTransfers,] = await Promise.all([
        dailyQuery.lean(),
        velocityQuery,
    ]);
    const dailyUsed = dailyTransactions.reduce((total, transaction) => total +
        getTransactionAmount(transaction), 0);
    if (dailyUsed +
        amount >
        settings.risk
            .dailyTransferLimit) {
        return {
            allowed: false,
            code: "DAILY_LIMIT_EXCEEDED",
            message: "This transfer would exceed the configured daily transfer limit.",
        };
    }
    if (windowTransfers >=
        settings.risk
            .maxTransfersPerWindow) {
        return {
            allowed: false,
            code: "VELOCITY_LIMIT_EXCEEDED",
            message: "Too many transfers were made in the configured velocity window.",
        };
    }
    const highValue = amount >=
        settings.risk
            .reviewThreshold;
    if (highValue &&
        settings.risk
            .requireKycForHighValue) {
        const userQuery = User_js_1.User.findById(senderId).select("kycStatus");
        if (session) {
            userQuery.session(session);
        }
        const user = await userQuery;
        if (!user ||
            user.kycStatus !==
                "verified") {
            return {
                allowed: false,
                code: "KYC_REQUIRED",
                message: "Verified KYC is required for this transfer.",
            };
        }
    }
    /*
     * Strong default: until a manual-review queue is
     * implemented, do not silently auto-complete transfers
     * above the configured review threshold.
     */
    if (highValue) {
        return {
            allowed: false,
            code: "MANUAL_REVIEW_REQUIRED",
            message: "This transfer requires manual review under the current platform policy.",
        };
    }
    const utilization = (dailyUsed +
        amount) /
        Math.max(settings.risk
            .dailyTransferLimit, 1);
    const riskScore = utilization >= 0.8 ||
        windowTransfers >=
            Math.max(settings.risk
                .maxTransfersPerWindow -
                2, 1)
        ? "MEDIUM"
        : "LOW";
    return {
        allowed: true,
        reviewRequired: false,
        riskScore,
        dailyUsed,
        dailyRemaining: Math.max(settings.risk
            .dailyTransferLimit -
            dailyUsed -
            amount, 0),
        windowTransfers,
    };
};
exports.evaluateTransferPolicy = evaluateTransferPolicy;
