"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewKYC = exports.getKYCDocuments = exports.getPendingKYCs = exports.getAllTransactions = exports.getAllUsers = exports.getAdminOverview = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const KYC_js_1 = require("../models/KYC.js");
const User_js_1 = require("../models/User.js");
const Transaction_js_1 = require("../models/Transaction.js");
const crypto_js_1 = require("../utils/crypto.js");
const kycService_js_1 = require("../services/kycService.js");
const cloudinaryService_js_1 = require("../services/cloudinaryService.js");
/* =========================================================
   SAFE DECRYPT
========================================================= */
const safeDecrypt = (value) => {
    if (!value ||
        typeof value !==
            "object") {
        return "";
    }
    const object = value;
    if (typeof object.encrypted !==
        "string" ||
        typeof object.iv !==
            "string" ||
        typeof object.authTag !==
            "string") {
        return "";
    }
    try {
        return (0, crypto_js_1.decryptData)({
            encrypted: object.encrypted,
            iv: object.iv,
            authTag: object.authTag,
        });
    }
    catch (error) {
        console.error("ADMIN PII DECRYPT ERROR:", error);
        return "";
    }
};
/* =========================================================
   TRANSACTION AMOUNT DECRYPT

   amountEncrypted stores minor units (poisha) as an
   AES-256-GCM encrypted string.

   Example:
   encrypted "50000" -> 50000 poisha -> BDT 500.00

========================================================= */
const getTransactionAmount = (transaction) => {
    const encryptedValue = transaction.amountEncrypted;
    if (!encryptedValue ||
        typeof encryptedValue !==
            "object") {
        throw new Error("Encrypted transaction amount is missing.");
    }
    const value = encryptedValue;
    if (typeof value.encrypted !==
        "string" ||
        typeof value.iv !==
            "string" ||
        typeof value.authTag !==
            "string") {
        throw new Error("Invalid encrypted transaction amount.");
    }
    const decryptedMinorUnits = Number((0, crypto_js_1.decryptData)({
        encrypted: value.encrypted,
        iv: value.iv,
        authTag: value.authTag,
    }));
    if (!Number.isSafeInteger(decryptedMinorUnits) ||
        decryptedMinorUnits < 0) {
        throw new Error("Invalid decrypted transaction amount.");
    }
    return (decryptedMinorUnits /
        100);
};
/* =========================================================
   POPULATED USER HELPER
========================================================= */
const getPopulatedUser = (value) => {
    if (!value ||
        typeof value !==
            "object") {
        return null;
    }
    const user = value;
    return {
        _id: user._id != null
            ? String(user._id)
            : undefined,
        name: typeof user.name ===
            "string"
            ? user.name
            : undefined,
        email: safeDecrypt(user.emailEncrypted),
        phone: safeDecrypt(user.phoneEncrypted),
        role: typeof user.role ===
            "string"
            ? user.role
            : undefined,
        kycStatus: typeof user.kycStatus ===
            "string"
            ? user.kycStatus
            : undefined,
    };
};
/* =========================================================
   TRANSACTION TYPE
========================================================= */
const mapTransactionType = (type) => {
    switch (String(type || "").toUpperCase()) {
        case "DEPOSIT":
            return "topup";
        case "WITHDRAW":
            return "withdraw";
        case "TRANSFER":
            return "send";
        default:
            return "payment";
    }
};
/* =========================================================
   TRANSACTION STATUS
========================================================= */
const mapTransactionStatus = (status) => {
    switch (String(status || "").toUpperCase()) {
        case "COMPLETED":
            return "completed";
        case "FAILED":
            return "failed";
        case "PENDING":
            return "pending";
        case "UNDER_REVIEW":
        case "REVIEW":
            return "under_review";
        default:
            return "pending";
    }
};
/* =========================================================
   RISK
========================================================= */
const mapRiskLevel = (risk) => {
    switch (String(risk || "LOW").toUpperCase()) {
        case "HIGH":
            return "high";
        case "MEDIUM":
            return "medium";
        default:
            return "low";
    }
};
/* =========================================================
   PERIOD START DATE
========================================================= */
const getPeriodStartDate = (period) => {
    const startDate = new Date();
    const now = new Date();
    switch (period) {
        case "today":
            startDate.setHours(0, 0, 0, 0);
            break;
        case "7d":
            startDate.setDate(startDate.getDate() -
                7);
            break;
        case "30d":
            startDate.setDate(startDate.getDate() -
                30);
            break;
        case "90d":
            startDate.setDate(startDate.getDate() -
                90);
            break;
        case "year":
            startDate.setFullYear(startDate.getFullYear() -
                1);
            break;
        default:
            startDate.setDate(startDate.getDate() -
                30);
    }
    if (period === "today") {
        return startDate;
    }
    if (startDate >
        now) {
        return now;
    }
    return startDate;
};
/* =========================================================
   ADMIN OVERVIEW
   GET /api/admin/overview
========================================================= */
const getAdminOverview = async (req, res) => {
    try {
        const period = typeof req.query.period ===
            "string"
            ? req.query.period
            : "30d";
        const now = new Date();
        const startDate = getPeriodStartDate(period);
        /* =====================================================
           USERS
        ====================================================== */
        const totalUsers = await User_js_1.User.countDocuments();
        const activeUsers = await User_js_1.User.countDocuments({
            updatedAt: {
                $gte: startDate,
                $lte: now,
            },
        });
        const inactiveUsers = Math.max(totalUsers -
            activeUsers, 0);
        /* =====================================================
           KYC
  
           KYC model uses lowercase statuses:
           not_started | pending | under_review | verified | rejected
        ====================================================== */
        const [verifiedKyc, pendingKyc, rejectedKyc, actionRequiredKyc,] = await Promise.all([
            KYC_js_1.KYC.countDocuments({
                status: "verified",
            }),
            KYC_js_1.KYC.countDocuments({
                status: "pending",
            }),
            KYC_js_1.KYC.countDocuments({
                status: "rejected",
            }),
            KYC_js_1.KYC.countDocuments({
                status: "under_review",
            }),
        ]);
        /* =====================================================
           TRANSACTIONS
        ====================================================== */
        const periodTransactions = await Transaction_js_1.Transaction.find({
            createdAt: {
                $gte: startDate,
                $lte: now,
            },
        })
            .populate("senderId", "name emailEncrypted phoneEncrypted")
            .populate("receiverId", "name emailEncrypted phoneEncrypted")
            .sort({
            createdAt: -1,
        })
            .lean();
        /* =====================================================
           TRANSACTION STATS
  
           Amount is decrypted in application memory from
           amountEncrypted.
        ====================================================== */
        const totalTransactions = periodTransactions.length;
        const transactionVolume = periodTransactions.reduce((sum, transaction) => {
            return (sum +
                getTransactionAmount(transaction));
        }, 0);
        const successfulTransactions = periodTransactions.filter((transaction) => String(transaction.status ||
            "").toUpperCase() ===
            "COMPLETED").length;
        const failedTransactions = periodTransactions.filter((transaction) => String(transaction.status ||
            "").toUpperCase() ===
            "FAILED").length;
        const pendingTransactions = periodTransactions.filter((transaction) => String(transaction.status ||
            "").toUpperCase() ===
            "PENDING").length;
        const successRate = totalTransactions > 0
            ? Number(((successfulTransactions /
                totalTransactions) *
                100).toFixed(2))
            : 0;
        /* =====================================================
           RISK
        ====================================================== */
        const highRisk = periodTransactions.filter((transaction) => String(transaction.riskScore ||
            "").toUpperCase() ===
            "HIGH").length;
        const mediumRisk = periodTransactions.filter((transaction) => String(transaction.riskScore ||
            "").toUpperCase() ===
            "MEDIUM").length;
        const lowRisk = periodTransactions.filter((transaction) => String(transaction.riskScore ||
            "").toUpperCase() ===
            "LOW").length;
        const totalFraudAlerts = highRisk +
            mediumRisk;
        /* =====================================================
           TRANSACTION TYPES
        ====================================================== */
        const typeMap = {};
        for (const transaction of periodTransactions) {
            const type = mapTransactionType(transaction.type);
            typeMap[type] =
                (typeMap[type] ||
                    0) + 1;
        }
        const typeTotal = Object.values(typeMap).reduce((sum, value) => sum +
            value, 0);
        const transactionTypes = Object.entries(typeMap).map(([name, value,]) => ({
            name,
            value,
            percentage: typeTotal > 0
                ? Number(((value /
                    typeTotal) *
                    100).toFixed(1))
                : 0,
        }));
        /* =====================================================
           ANALYTICS
        ====================================================== */
        const analyticsMap = new Map();
        for (const transaction of periodTransactions) {
            const createdAt = transaction.createdAt
                ? new Date(transaction.createdAt)
                : now;
            const key = createdAt
                .toISOString()
                .slice(0, 10);
            if (!analyticsMap.has(key)) {
                analyticsMap.set(key, {
                    volume: 0,
                    count: 0,
                    success: 0,
                    failed: 0,
                });
            }
            const current = analyticsMap.get(key);
            current.volume +=
                getTransactionAmount(transaction);
            current.count +=
                1;
            const status = String(transaction.status ||
                "").toUpperCase();
            if (status ===
                "COMPLETED") {
                current.success +=
                    1;
            }
            if (status ===
                "FAILED") {
                current.failed +=
                    1;
            }
        }
        const transactionAnalytics = Array.from(analyticsMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, values,]) => ({
            time: date,
            ...values,
        }));
        /* =====================================================
           USER GROWTH
        ====================================================== */
        const usersInPeriod = await User_js_1.User.find({
            createdAt: {
                $gte: startDate,
                $lte: now,
            },
        })
            .select("createdAt updatedAt")
            .sort({
            createdAt: 1,
        })
            .lean();
        const userGrowthMap = new Map();
        for (const user of usersInPeriod) {
            if (!user.createdAt) {
                continue;
            }
            const createdAt = new Date(user.createdAt);
            const key = createdAt
                .toISOString()
                .slice(0, 10);
            userGrowthMap.set(key, (userGrowthMap.get(key) ||
                0) + 1);
        }
        const userGrowth = Array.from(userGrowthMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([label, newUsers,]) => ({
            label,
            newUsers,
            activeUsers,
            returning: 0,
        }));
        /* =====================================================
           RECENT TRANSACTIONS
        ====================================================== */
        const recentTransactions = periodTransactions
            .slice(0, 10)
            .map((transaction) => {
            const sender = getPopulatedUser(transaction.senderId);
            const receiver = getPopulatedUser(transaction.receiverId);
            const transactionId = transaction._id.toString();
            const reference = getTransactionReference(transaction);
            return {
                id: transactionId,
                _id: transactionId,
                txnId: reference ||
                    transactionId,
                userName: receiver?.name ||
                    sender?.name ||
                    "Unknown User",
                userEmail: receiver?.email ||
                    sender?.email ||
                    "",
                type: mapTransactionType(transaction.type),
                amount: getTransactionAmount(transaction),
                currency: typeof transaction.currency ===
                    "string"
                    ? transaction.currency
                    : "BDT",
                riskLevel: mapRiskLevel(transaction.riskScore),
                status: mapTransactionStatus(transaction.status),
                timestamp: transaction.createdAt
                    ? new Date(transaction.createdAt).toISOString()
                    : undefined,
                createdAt: transaction.createdAt
                    ? new Date(transaction.createdAt).toISOString()
                    : undefined,
            };
        });
        /* =====================================================
           RECENT KYC
        ====================================================== */
        const recentKycDocs = await KYC_js_1.KYC.find()
            .populate("userId", "name emailEncrypted phoneEncrypted")
            .sort({
            createdAt: -1,
        })
            .limit(5)
            .lean();
        const recentKyc = recentKycDocs.map((kyc) => {
            const user = getPopulatedUser(kyc.userId);
            return {
                id: kyc._id?.toString(),
                _id: kyc._id?.toString(),
                userName: user?.name ||
                    "Unknown User",
                userEmail: user?.email ||
                    "",
                documentType: kyc.documentType ||
                    "Identity Document",
                status: String(kyc.status ||
                    "not_started").toLowerCase(),
                submittedAt: kyc.createdAt
                    ? new Date(kyc.createdAt).toLocaleString()
                    : "Recently",
            };
        });
        /* =====================================================
           SYSTEM HEALTH
        ====================================================== */
        const systemHealth = [
            {
                name: "Core API Gateway",
                status: "operational",
                latency: "—",
            },
            {
                name: "MongoDB",
                status: "operational",
                latency: "—",
            },
            {
                name: "Authentication",
                status: "operational",
                latency: "—",
            },
            {
                name: "Transaction Engine",
                status: "operational",
                latency: "—",
            },
            {
                name: "AI Fraud Detector",
                status: "operational",
                latency: "—",
            },
        ];
        const aiInsight = {
            title: "Operational Insight",
            description: successRate >=
                95
                ? `Transaction processing is operating normally with a ${successRate}% success rate for the selected period.`
                : `Transaction success rate is ${successRate}%. Review failed and pending transactions for operational issues.`,
        };
        /* =====================================================
           RESPONSE
        ====================================================== */
        res.status(200).json({
            success: true,
            period,
            stats: {
                users: {
                    total: totalUsers,
                    active: activeUsers,
                    inactive: inactiveUsers,
                    growth: 0,
                },
                transactions: {
                    total: totalTransactions,
                    volume: transactionVolume,
                    successRate,
                    failed: failedTransactions,
                    pending: pendingTransactions,
                },
                kyc: {
                    verified: verifiedKyc,
                    pending: pendingKyc,
                    rejected: rejectedKyc,
                    actionRequired: actionRequiredKyc,
                },
                fraud: {
                    totalAlerts: totalFraudAlerts,
                    highRisk,
                    mediumRisk,
                    lowRisk,
                },
            },
            transactionAnalytics,
            userGrowth,
            transactionTypes,
            recentTransactions,
            recentKyc,
            activities: [],
            systemHealth,
            aiInsight,
        });
    }
    catch (error) {
        console.error("GET ADMIN OVERVIEW ERROR:", error);
        res.status(500).json({
            success: false,
            message: error instanceof Error
                ? error.message
                : "Failed to load admin overview.",
        });
    }
};
exports.getAdminOverview = getAdminOverview;
/* =========================================================
   GET ALL USERS
   GET /api/admin/users
========================================================= */
const getAllUsers = async (_req, res) => {
    try {
        /*
         * IMPORTANT:
         *
         * encrypted values DB থেকে backend-এ আসবে,
         * কিন্তু raw ciphertext API response-এ যাবে না।
         */
        const users = await User_js_1.User.find()
            .select([
            "name",
            "emailEncrypted",
            "phoneEncrypted",
            "role",
            "kycStatus",
            "walletId",
            "createdAt",
            "updatedAt",
        ].join(" "))
            .sort({
            createdAt: -1,
        });
        const safeUsers = users.map((user) => ({
            _id: user._id,
            name: user.name,
            email: safeDecrypt(user.emailEncrypted),
            phone: safeDecrypt(user.phoneEncrypted),
            role: user.role,
            kycStatus: user.kycStatus,
            walletId: user.walletId,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        }));
        res.status(200).json({
            success: true,
            count: safeUsers.length,
            users: safeUsers,
        });
    }
    catch (error) {
        console.error("GET ALL USERS ERROR:", error);
        res.status(500).json({
            success: false,
            message: error instanceof Error
                ? error.message
                : "Failed to load users.",
        });
    }
};
exports.getAllUsers = getAllUsers;
/* =========================================================
   GET ALL TRANSACTIONS
   GET /api/admin/transactions
========================================================= */
const getAllTransactions = async (_req, res) => {
    try {
        const transactions = await Transaction_js_1.Transaction.find()
            .populate("senderId", "name emailEncrypted phoneEncrypted")
            .populate("receiverId", "name emailEncrypted phoneEncrypted")
            .sort({
            createdAt: -1,
        })
            .lean();
        const safeTransactions = transactions.map((transaction) => {
            const sender = getPopulatedUser(transaction.senderId);
            const receiver = getPopulatedUser(transaction.receiverId);
            const rawType = String(transaction.type ||
                "TRANSFER").toUpperCase();
            const type = rawType === "DEPOSIT"
                ? "DEPOSIT"
                : rawType === "WITHDRAW"
                    ? "WITHDRAW"
                    : "TRANSFER";
            const rawStatus = String(transaction.status ||
                "PENDING").toUpperCase();
            const status = rawStatus === "COMPLETED"
                ? "COMPLETED"
                : rawStatus === "FAILED"
                    ? "FAILED"
                    : "PENDING";
            const rawRisk = String(transaction.riskScore ||
                "LOW").toUpperCase();
            const riskScore = rawRisk === "HIGH"
                ? "HIGH"
                : rawRisk === "MEDIUM"
                    ? "MEDIUM"
                    : "LOW";
            return {
                _id: transaction._id.toString(),
                senderId: sender
                    ? {
                        _id: sender._id || "",
                        name: sender.name || "Unknown User",
                        email: sender.email || "",
                        phone: sender.phone || "",
                    }
                    : String(transaction.senderId || ""),
                receiverId: receiver
                    ? {
                        _id: receiver._id || "",
                        name: receiver.name || "Unknown User",
                        email: receiver.email || "",
                        phone: receiver.phone || "",
                    }
                    : String(transaction.receiverId || ""),
                amount: getTransactionAmount(transaction),
                currency: typeof transaction.currency ===
                    "string"
                    ? transaction.currency
                    : "BDT",
                type,
                status,
                reference: getTransactionReference(transaction),
                riskScore,
                createdAt: transaction.createdAt
                    ? new Date(transaction.createdAt).toISOString()
                    : undefined,
                updatedAt: transaction.updatedAt
                    ? new Date(transaction.updatedAt).toISOString()
                    : undefined,
            };
        });
        res.status(200).json({
            success: true,
            count: safeTransactions.length,
            transactions: safeTransactions,
        });
    }
    catch (error) {
        console.error("GET ALL TRANSACTIONS ERROR:", error);
        res.status(500).json({
            success: false,
            message: error instanceof Error
                ? error.message
                : "Failed to load transactions.",
        });
    }
};
exports.getAllTransactions = getAllTransactions;
const getTransactionReference = (transaction) => {
    const encrypted = transaction.referenceEncrypted;
    if (encrypted &&
        typeof encrypted ===
            "object") {
        const value = encrypted;
        if (typeof value.encrypted ===
            "string" &&
            typeof value.iv ===
                "string" &&
            typeof value.authTag ===
                "string") {
            try {
                return (0, crypto_js_1.decryptData)({
                    encrypted: value.encrypted,
                    iv: value.iv,
                    authTag: value.authTag,
                });
            }
            catch (error) {
                console.error("ADMIN TRANSACTION REFERENCE DECRYPT ERROR:", error);
            }
        }
    }
};
/* =========================================================
   KYC DOCUMENT NUMBER READ

   Document numbers are stored only as AES-256-GCM encrypted
   values. Plaintext storage is not supported.
========================================================= */
const getKYCDocumentNumber = (kyc) => {
    return (safeDecrypt(kyc.documentNumberEncrypted) || "");
};
/* =========================================================
   MASK SENSITIVE VALUE
========================================================= */
const maskSensitiveValue = (value) => {
    if (!value) {
        return "";
    }
    const clean = value.trim();
    if (!clean) {
        return "";
    }
    if (clean.length <= 4) {
        return "*".repeat(clean.length);
    }
    const visible = clean.slice(-4);
    const hiddenLength = Math.max(4, clean.length - 4);
    return `${"*".repeat(hiddenLength)}${visible}`;
};
/* =========================================================
   GET PENDING / UNDER REVIEW KYC
   GET /api/admin/kyc/pending
========================================================= */
const getPendingKYCs = async (_req, res) => {
    try {
        const kycs = await KYC_js_1.KYC.find({
            status: {
                $in: [
                    "pending",
                    "under_review",
                ],
            },
        })
            .populate("userId", [
            "name",
            "emailEncrypted",
            "phoneEncrypted",
            "role",
            "kycStatus",
        ].join(" "))
            .sort({
            submittedAt: -1,
            createdAt: -1,
        })
            .lean();
        const safeKycs = kycs.map((kyc) => {
            const user = getPopulatedUser(kyc.userId);
            return {
                _id: kyc._id,
                userId: user
                    ? {
                        _id: user._id,
                        name: user.name,
                        email: user.email,
                        phone: user.phone,
                        role: user.role,
                        kycStatus: user.kycStatus,
                    }
                    : kyc.userId,
                documentType: kyc.documentType,
                documentNumber: maskSensitiveValue(getKYCDocumentNumber(kyc)),
                provider: kyc.provider,
                status: kyc.status,
                rejectionReason: kyc.rejectionReason,
                submittedAt: kyc.submittedAt,
                verifiedAt: kyc.verifiedAt,
                createdAt: kyc.createdAt,
                updatedAt: kyc.updatedAt,
                hasFrontImage: Boolean(kyc.frontImagePublicId),
                hasBackImage: Boolean(kyc.backImagePublicId),
                hasSelfieImage: Boolean(kyc.selfieImagePublicId),
            };
        });
        res.status(200).json({
            success: true,
            count: safeKycs.length,
            kycs: safeKycs,
        });
    }
    catch (error) {
        console.error("GET PENDING KYC ERROR:", error);
        res.status(500).json({
            success: false,
            message: error instanceof Error
                ? error.message
                : "Failed to load pending KYCs.",
        });
    }
};
exports.getPendingKYCs = getPendingKYCs;
/* =========================================================
   GET PRIVATE KYC DOCUMENTS
   GET /api/admin/kyc/:id/documents

   - Admin only (enforced by adminRoutes)
   - Never returns Cloudinary public IDs
   - Returns temporary signed URLs only
   - URLs expire after about 10 minutes
========================================================= */
const getKYCDocuments = async (req, res) => {
    try {
        const id = req.params.id;
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid KYC record id.",
            });
            return;
        }
        const kyc = await KYC_js_1.KYC.findById(id)
            .select([
            "frontImagePublicId",
            "backImagePublicId",
            "selfieImagePublicId",
        ].join(" "))
            .lean();
        if (!kyc) {
            res.status(404).json({
                success: false,
                message: "KYC record not found.",
            });
            return;
        }
        const [frontResult, backResult, selfieResult,] = await Promise.allSettled([
            kyc.frontImagePublicId
                ? (0, cloudinaryService_js_1.createKYCDownloadUrl)(kyc.frontImagePublicId)
                : Promise.resolve(undefined),
            kyc.backImagePublicId
                ? (0, cloudinaryService_js_1.createKYCDownloadUrl)(kyc.backImagePublicId)
                : Promise.resolve(undefined),
            kyc.selfieImagePublicId
                ? (0, cloudinaryService_js_1.createKYCDownloadUrl)(kyc.selfieImagePublicId)
                : Promise.resolve(undefined),
        ]);
        const getValue = (result) => {
            if (result.status ===
                "fulfilled") {
                return result.value;
            }
            console.error("KYC SIGNED URL ERROR:", result.reason);
            return undefined;
        };
        const frontUrl = getValue(frontResult);
        const backUrl = getValue(backResult);
        const selfieUrl = getValue(selfieResult);
        /*
         * Sensitive signed URLs should not be cached by browsers,
         * CDNs or shared proxies.
         */
        res.set({
            "Cache-Control": "private, no-store, max-age=0",
            Pragma: "no-cache",
            Expires: "0",
        });
        res.status(200).json({
            success: true,
            expiresIn: 10 * 60,
            documents: {
                frontUrl,
                backUrl,
                selfieUrl,
            },
        });
    }
    catch (error) {
        console.error("GET KYC DOCUMENTS ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to generate temporary KYC document access.",
        });
    }
};
exports.getKYCDocuments = getKYCDocuments;
/* =========================================================
   REVIEW KYC
   PATCH /api/admin/kyc/:id/review
========================================================= */
const reviewKYC = async (req, res) => {
    try {
        const id = req.params.id;
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid KYC record id.",
            });
            return;
        }
        const rawStatus = typeof req.body?.status ===
            "string"
            ? req.body.status
                .trim()
                .toLowerCase()
            : "";
        const rejectionReason = typeof req.body
            ?.rejectionReason ===
            "string"
            ? req.body.rejectionReason
                .trim()
            : "";
        if (![
            "verified",
            "rejected",
        ].includes(rawStatus)) {
            res.status(400).json({
                success: false,
                message: "Invalid status. Must be verified or rejected.",
            });
            return;
        }
        if (rawStatus ===
            "rejected" &&
            rejectionReason.length <
                3) {
            res.status(400).json({
                success: false,
                message: "A rejection reason is required.",
            });
            return;
        }
        const kyc = await KYC_js_1.KYC.findById(id);
        if (!kyc) {
            res.status(404).json({
                success: false,
                message: "KYC record not found.",
            });
            return;
        }
        if (kyc.status ===
            "verified") {
            res.status(409).json({
                success: false,
                message: "This KYC request is already verified.",
            });
            return;
        }
        if (![
            "pending",
            "under_review",
            "rejected",
        ].includes(kyc.status)) {
            res.status(409).json({
                success: false,
                message: "This KYC request cannot be reviewed in its current state.",
            });
            return;
        }
        const status = rawStatus;
        const updatedKYC = await (0, kycService_js_1.updateKYCStatus)(kyc.userId.toString(), status, status ===
            "rejected"
            ? rejectionReason
            : undefined);
        if (!updatedKYC) {
            res.status(404).json({
                success: false,
                message: "KYC record could not be updated.",
            });
            return;
        }
        await User_js_1.User.findByIdAndUpdate(kyc.userId, {
            kycStatus: status,
        });
        res.status(200).json({
            success: true,
            message: status ===
                "verified"
                ? "KYC request verified successfully."
                : "KYC request rejected successfully.",
            kyc: {
                _id: updatedKYC._id,
                userId: updatedKYC.userId,
                documentType: updatedKYC.documentType,
                documentNumber: maskSensitiveValue(getKYCDocumentNumber(updatedKYC)),
                provider: updatedKYC.provider,
                status: updatedKYC.status,
                rejectionReason: updatedKYC.rejectionReason,
                submittedAt: updatedKYC.submittedAt,
                verifiedAt: updatedKYC.verifiedAt,
            },
        });
    }
    catch (error) {
        console.error("REVIEW KYC ERROR:", error);
        res.status(500).json({
            success: false,
            message: error instanceof Error
                ? error.message
                : "Failed to review KYC.",
        });
    }
};
exports.reviewKYC = reviewKYC;
