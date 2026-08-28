"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewKYC = exports.getPendingKYCs = exports.getAllUsers = exports.getAdminOverview = void 0;
const KYC_js_1 = require("../models/KYC.js");
const User_js_1 = require("../models/User.js");
const Transaction_js_1 = require("../models/Transaction.js");
/* =========================================================
   HELPERS
========================================================= */
const getPopulatedUser = (value) => {
    if (!value ||
        typeof value !== "object") {
        return null;
    }
    const user = value;
    return {
        _id: user._id != null
            ? String(user._id)
            : undefined,
        name: typeof user.name === "string"
            ? user.name
            : undefined,
        email: typeof user.email === "string"
            ? user.email
            : undefined,
        phone: typeof user.phone === "string"
            ? user.phone
            : undefined,
    };
};
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
const getPeriodStartDate = (period) => {
    const startDate = new Date();
    const now = new Date();
    switch (period) {
        case "today":
            startDate.setHours(0, 0, 0, 0);
            break;
        case "7d":
            startDate.setDate(startDate.getDate() - 7);
            break;
        case "30d":
            startDate.setDate(startDate.getDate() - 30);
            break;
        case "90d":
            startDate.setDate(startDate.getDate() - 90);
            break;
        case "year":
            startDate.setFullYear(startDate.getFullYear() - 1);
            break;
        default:
            startDate.setDate(startDate.getDate() - 30);
    }
    if (period === "today") {
        return startDate;
    }
    // Prevent accidental future date issues.
    if (startDate > now) {
        return now;
    }
    return startDate;
};
/* =========================================================
   ADMIN OVERVIEW
   GET /api/admin/overview?period=30d
   Private/Admin
========================================================= */
const getAdminOverview = async (req, res) => {
    try {
        const period = typeof req.query.period === "string"
            ? req.query.period
            : "30d";
        const now = new Date();
        const startDate = getPeriodStartDate(period);
        /* =======================================================
           USERS
        ======================================================== */
        const totalUsers = await User_js_1.User.countDocuments();
        const activeUsers = await User_js_1.User.countDocuments({
            updatedAt: {
                $gte: startDate,
                $lte: now,
            },
        });
        const inactiveUsers = Math.max(totalUsers - activeUsers, 0);
        /* =======================================================
           KYC
        ======================================================== */
        const [verifiedKyc, pendingKyc, rejectedKyc, actionRequiredKyc,] = await Promise.all([
            KYC_js_1.KYC.countDocuments({
                status: "VERIFIED",
            }),
            KYC_js_1.KYC.countDocuments({
                status: "PENDING",
            }),
            KYC_js_1.KYC.countDocuments({
                status: "REJECTED",
            }),
            KYC_js_1.KYC.countDocuments({
                status: "ACTION_REQUIRED",
            }),
        ]);
        /* =======================================================
           TRANSACTIONS
        ======================================================== */
        const periodTransactions = await Transaction_js_1.Transaction.find({
            createdAt: {
                $gte: startDate,
                $lte: now,
            },
        })
            .populate("senderId", "name email phone")
            .populate("receiverId", "name email phone")
            .sort({
            createdAt: -1,
        })
            .lean();
        /* =======================================================
           TRANSACTION STATS
        ======================================================== */
        const totalTransactions = periodTransactions.length;
        const transactionVolume = periodTransactions.reduce((sum, transaction) => {
            return (sum +
                Number(transaction.amount || 0));
        }, 0);
        const successfulTransactions = periodTransactions.filter((transaction) => String(transaction.status || "").toUpperCase() ===
            "COMPLETED").length;
        const failedTransactions = periodTransactions.filter((transaction) => String(transaction.status || "").toUpperCase() ===
            "FAILED").length;
        const pendingTransactions = periodTransactions.filter((transaction) => String(transaction.status || "").toUpperCase() ===
            "PENDING").length;
        const successRate = totalTransactions > 0
            ? Number(((successfulTransactions /
                totalTransactions) *
                100).toFixed(2))
            : 0;
        /* =======================================================
           RISK / FRAUD
        ======================================================== */
        const highRisk = periodTransactions.filter((transaction) => String(transaction.riskScore || "").toUpperCase() === "HIGH").length;
        const mediumRisk = periodTransactions.filter((transaction) => String(transaction.riskScore || "").toUpperCase() === "MEDIUM").length;
        const lowRisk = periodTransactions.filter((transaction) => String(transaction.riskScore || "").toUpperCase() === "LOW").length;
        const totalFraudAlerts = highRisk + mediumRisk;
        /* =======================================================
           TRANSACTION TYPES
        ======================================================== */
        const typeMap = {};
        for (const transaction of periodTransactions) {
            const type = mapTransactionType(transaction.type);
            typeMap[type] =
                (typeMap[type] || 0) + 1;
        }
        const typeTotal = Object.values(typeMap).reduce((sum, value) => sum + value, 0);
        const transactionTypes = Object.entries(typeMap).map(([name, value]) => ({
            name,
            value,
            percentage: typeTotal > 0
                ? Number(((value /
                    typeTotal) *
                    100).toFixed(1))
                : 0,
        }));
        /* =======================================================
           TRANSACTION ANALYTICS
        ======================================================== */
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
            current.volume += Number(transaction.amount || 0);
            current.count += 1;
            const status = String(transaction.status || "").toUpperCase();
            if (status === "COMPLETED") {
                current.success += 1;
            }
            if (status === "FAILED") {
                current.failed += 1;
            }
        }
        const transactionAnalytics = Array.from(analyticsMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, values]) => ({
            time: date,
            ...values,
        }));
        /* =======================================================
           USER GROWTH
        ======================================================== */
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
            userGrowthMap.set(key, (userGrowthMap.get(key) || 0) +
                1);
        }
        const userGrowth = Array.from(userGrowthMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([label, newUsers]) => ({
            label,
            newUsers,
            activeUsers,
            returning: 0,
        }));
        /* =======================================================
           RECENT TRANSACTIONS
        ======================================================== */
        const recentTransactions = periodTransactions
            .slice(0, 10)
            .map((transaction) => {
            /*
              Because senderId / receiverId can be
              ObjectId OR populated objects, we process them
              through a safe helper.
            */
            const sender = getPopulatedUser(transaction.senderId);
            const receiver = getPopulatedUser(transaction.receiverId);
            const transactionId = transaction._id?.toString();
            const reference = typeof transaction.reference ===
                "string"
                ? transaction.reference
                : undefined;
            return {
                id: transactionId,
                _id: transactionId,
                txnId: reference ||
                    transactionId,
                /*
                  If receiver exists, show receiver.
                  Otherwise fallback to sender.
                */
                userName: receiver?.name ||
                    sender?.name ||
                    "Unknown User",
                userEmail: receiver?.email ||
                    sender?.email ||
                    "",
                type: mapTransactionType(transaction.type),
                amount: Number(transaction.amount || 0),
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
        /* =======================================================
           RECENT KYC
        ======================================================== */
        const recentKycDocs = await KYC_js_1.KYC.find()
            .populate("userId", "name email phone")
            .sort({
            createdAt: -1,
        })
            .limit(5)
            .lean();
        const recentKyc = recentKycDocs.map((kyc) => ({
            id: kyc._id?.toString(),
            _id: kyc._id?.toString(),
            userName: kyc.userId?.name ||
                "Unknown User",
            userEmail: kyc.userId?.email ||
                "",
            documentType: kyc.documentType ||
                "Identity Document",
            status: String(kyc.status ||
                "PENDING").toLowerCase(),
            submittedAt: kyc.createdAt
                ? new Date(kyc.createdAt).toLocaleString()
                : "Recently",
        }));
        /* =======================================================
           SYSTEM HEALTH
        ======================================================== */
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
        /* =======================================================
           AI INSIGHT
        ======================================================== */
        const aiInsight = {
            title: "Operational Insight",
            description: successRate >= 95
                ? `Transaction processing is operating normally with a ${successRate}% success rate for the selected period.`
                : `Transaction success rate is ${successRate}%. Review failed and pending transactions for operational issues.`,
        };
        /* =======================================================
           RESPONSE
        ======================================================== */
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
                    highRisk: highRisk,
                    mediumRisk: mediumRisk,
                    lowRisk: lowRisk,
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
        console.error("getAdminOverview error:", error);
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
   GET ALL REGISTERED USERS
   GET /api/admin/users
========================================================= */
const getAllUsers = async (req, res) => {
    try {
        const users = await User_js_1.User.find()
            .select("-password")
            .sort({
            createdAt: -1,
        });
        res.status(200).json({
            success: true,
            count: users.length,
            users,
        });
    }
    catch (error) {
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
   GET PENDING KYC REQUESTS
   GET /api/admin/kyc/pending
========================================================= */
const getPendingKYCs = async (req, res) => {
    try {
        const kycs = await KYC_js_1.KYC.find({
            status: "PENDING",
        }).populate("userId", "name email phone");
        res.status(200).json({
            success: true,
            count: kycs.length,
            kycs,
        });
    }
    catch (error) {
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
   REVIEW KYC
   PATCH /api/admin/kyc/:id/review
========================================================= */
const reviewKYC = async (req, res) => {
    try {
        const { status, rejectionReason, } = req.body;
        const id = req.params.id;
        if (![
            "VERIFIED",
            "REJECTED",
        ].includes(status)) {
            res.status(400).json({
                success: false,
                message: "Invalid status. Must be VERIFIED or REJECTED",
            });
            return;
        }
        const kyc = await KYC_js_1.KYC.findById(id);
        if (!kyc) {
            res.status(404).json({
                success: false,
                message: "KYC record not found",
            });
            return;
        }
        kyc.status = status;
        kyc.rejectionReason =
            status === "REJECTED"
                ? rejectionReason ||
                    "Documents not valid"
                : "";
        kyc.reviewedBy =
            req.user?._id;
        await kyc.save();
        await User_js_1.User.findByIdAndUpdate(kyc.userId, {
            kycStatus: status,
        });
        res.status(200).json({
            success: true,
            message: `KYC request ${status.toLowerCase()} successfully`,
            kyc,
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error instanceof Error
                ? error.message
                : "Failed to review KYC.",
        });
    }
};
exports.reviewKYC = reviewKYC;
