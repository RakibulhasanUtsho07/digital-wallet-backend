"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openLeakageInvestigation = exports.getRevenueContributors = exports.getRevenueLeakage = exports.simulateRevenueFees = exports.feePolicyToDTO = exports.getOrCreateRevenueFeePolicy = exports.revenueRangeStart = exports.normalizeRevenueRange = void 0;
const RevenueEvent_js_1 = require("../models/RevenueEvent.js");
const RevenueFeePolicy_js_1 = require("../models/RevenueFeePolicy.js");
const RevenueLeakageInvestigation_js_1 = require("../models/RevenueLeakageInvestigation.js");
const User_js_1 = require("../models/User.js");
const crypto_js_1 = require("../utils/crypto.js");
const RANGE_MS = {
    "24H": 24 *
        60 *
        60 *
        1000,
    "7D": 7 *
        24 *
        60 *
        60 *
        1000,
    "30D": 30 *
        24 *
        60 *
        60 *
        1000,
    "90D": 90 *
        24 *
        60 *
        60 *
        1000,
    "6M": 183 *
        24 *
        60 *
        60 *
        1000,
    "1Y": 365 *
        24 *
        60 *
        60 *
        1000,
};
const normalizeRevenueRange = (value) => {
    const candidate = typeof value ===
        "string"
        ? value.toUpperCase()
        : "30D";
    if (candidate in
        RANGE_MS) {
        return candidate;
    }
    return "30D";
};
exports.normalizeRevenueRange = normalizeRevenueRange;
const revenueRangeStart = (range) => new Date(Date.now() -
    RANGE_MS[range]);
exports.revenueRangeStart = revenueRangeStart;
const getOrCreateRevenueFeePolicy = async () => {
    const existing = await RevenueFeePolicy_js_1.RevenueFeePolicy.findOne({
        key: "global",
    });
    if (existing) {
        return existing;
    }
    try {
        return await RevenueFeePolicy_js_1.RevenueFeePolicy.create({
            key: "global",
        });
    }
    catch (error) {
        if (error?.code ===
            11000) {
            const raced = await RevenueFeePolicy_js_1.RevenueFeePolicy.findOne({
                key: "global",
            });
            if (raced) {
                return raced;
            }
        }
        throw error;
    }
};
exports.getOrCreateRevenueFeePolicy = getOrCreateRevenueFeePolicy;
const feePolicyToDTO = (policy) => ({
    transferFeeMinor: policy.transferFeeMinor,
    withdrawalFeeMinor: policy.withdrawalFeeMinor,
    monthlyTxnEstimate: policy.monthlyTxnEstimate,
    transferShareBps: policy.transferShareBps,
    withdrawalShareBps: policy.withdrawalShareBps,
    elasticityBpsPer200Minor: policy.elasticityBpsPer200Minor,
    revision: policy.revision,
    updatedAt: policy.updatedAt
        ?.toISOString?.() ??
        null,
});
exports.feePolicyToDTO = feePolicyToDTO;
const requireIntegerInRange = (value, min, max, field) => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) ||
        parsed <
            min ||
        parsed >
            max) {
        throw new Error(`${field} is outside the allowed simulation range.`);
    }
    return parsed;
};
const simulateRevenueFees = async ({ transferFeeMinor, withdrawalFeeMinor, monthlyTransactions, }) => {
    const policy = await (0, exports.getOrCreateRevenueFeePolicy)();
    const transferFee = requireIntegerInRange(transferFeeMinor, 0, 2500, "transferFeeMinor");
    const withdrawalFee = requireIntegerInRange(withdrawalFeeMinor, 500, 4000, "withdrawalFeeMinor");
    const monthlyTxns = requireIntegerInRange(monthlyTransactions, 50000, 300000, "monthlyTransactions");
    const transferShare = policy.transferShareBps /
        10000;
    const withdrawalShare = policy.withdrawalShareBps /
        10000;
    const elasticityPerStep = policy.elasticityBpsPer200Minor /
        10000;
    const transferIncreaseSteps = Math.max(0, (transferFee -
        policy.transferFeeMinor) /
        200);
    const withdrawalIncreaseSteps = Math.max(0, (withdrawalFee -
        policy.withdrawalFeeMinor) /
        200);
    const transferElasticity = Math.max(0.5, 1 -
        transferIncreaseSteps *
            elasticityPerStep);
    const withdrawalElasticity = Math.max(0.5, 1 -
        withdrawalIncreaseSteps *
            elasticityPerStep);
    const transferTransactions = Math.round(monthlyTxns *
        transferShare *
        transferElasticity);
    const withdrawalTransactions = Math.round(monthlyTxns *
        withdrawalShare *
        withdrawalElasticity);
    const transferContributionMinor = transferTransactions *
        transferFee;
    const withdrawalContributionMinor = withdrawalTransactions *
        withdrawalFee;
    const projectedRevenueMinor = transferContributionMinor +
        withdrawalContributionMinor;
    const baselineTransferTransactions = Math.round(monthlyTxns *
        transferShare);
    const baselineWithdrawalTransactions = Math.round(monthlyTxns *
        withdrawalShare);
    const baselineRevenueMinor = baselineTransferTransactions *
        policy.transferFeeMinor +
        baselineWithdrawalTransactions *
            policy.withdrawalFeeMinor;
    const differenceMinor = projectedRevenueMinor -
        baselineRevenueMinor;
    const percentageChange = baselineRevenueMinor >
        0
        ? (differenceMinor /
            baselineRevenueMinor) *
            100
        : 0;
    return {
        projectedRevenueMinor,
        baselineRevenueMinor,
        differenceMinor,
        percentageChange: Number(percentageChange.toFixed(2)),
        transferContributionMinor,
        withdrawalContributionMinor,
        transferTransactions,
        withdrawalTransactions,
        requestedMonthlyTransactions: monthlyTxns,
        assumptions: {
            transferShare,
            withdrawalShare,
            elasticityPercentPerTwoTakaIncrease: policy.elasticityBpsPer200Minor /
                100,
            source: "policy",
        },
    };
};
exports.simulateRevenueFees = simulateRevenueFees;
const leakageDefinition = {
    GATEWAY_REVERSAL: {
        category: "Gateway Fee Reversals",
        reason: "Fees lost through gateway or settlement reversals after an earlier revenue capture.",
        action: "Review gateway timeout, settlement and reversal controls.",
    },
    FEE_WAIVER: {
        category: "Manual Fee Waivers",
        reason: "Revenue waived through support, dispute or administrative fee concessions.",
        action: "Review waiver approval thresholds and exception policy.",
    },
    MICRO_FEE_ADJUSTMENT: {
        category: "Uncaptured Micro-Fees",
        reason: "Small fee adjustments caused by precision, rounding or minimum-fee mismatches.",
        action: "Review fee calculation precision and minimum-fee handling.",
    },
};
const riskFromAmountMinor = (amountMinor) => {
    const amount = amountMinor /
        100;
    if (amount >=
        20000) {
        return "High";
    }
    if (amount >=
        5000) {
        return "Medium";
    }
    return "Low";
};
const getRevenueLeakage = async (range) => {
    const start = (0, exports.revenueRangeStart)(range);
    const rows = await RevenueEvent_js_1.RevenueEvent.aggregate([
        {
            $match: {
                occurredAt: {
                    $gte: start,
                },
                kind: {
                    $in: [
                        "GATEWAY_REVERSAL",
                        "FEE_WAIVER",
                        "MICRO_FEE_ADJUSTMENT",
                    ],
                },
            },
        },
        {
            $group: {
                _id: "$kind",
                amountMinor: {
                    $sum: "$feeMinor",
                },
                count: {
                    $sum: 1,
                },
            },
        },
        {
            $sort: {
                amountMinor: -1,
            },
        },
    ]);
    const categories = rows.map((row) => leakageDefinition[row._id].category);
    const investigations = categories.length >
        0
        ? await RevenueLeakageInvestigation_js_1.RevenueLeakageInvestigation.find({
            category: {
                $in: categories,
            },
            status: "investigating",
        })
            .sort({
            createdAt: -1,
        })
            .lean()
        : [];
    const investigationByCategory = new Map();
    for (const item of investigations) {
        if (!investigationByCategory.has(item.category)) {
            investigationByCategory.set(item.category, item.status);
        }
    }
    const signals = rows.map((row) => {
        const definition = leakageDefinition[row._id];
        return {
            id: row._id
                .toLowerCase()
                .replace(/_/g, "-"),
            category: definition.category,
            amountMinor: row.amountMinor,
            sourceEventCount: row.count,
            reason: definition.reason,
            riskLevel: riskFromAmountMinor(row.amountMinor),
            action: definition.action,
            investigationStatus: investigationByCategory.get(definition.category) ??
                "none",
        };
    });
    return {
        totalLeakageMinor: signals.reduce((total, item) => total +
            item.amountMinor, 0),
        signals,
    };
};
exports.getRevenueLeakage = getRevenueLeakage;
const decryptEmail = (value) => {
    if (!value) {
        return "";
    }
    try {
        return (0, crypto_js_1.decryptData)(value);
    }
    catch {
        return "";
    }
};
const contributorType = (volumeMinor) => {
    const volume = volumeMinor /
        100;
    if (volume >=
        1500000) {
        return "VIP";
    }
    if (volume >=
        1000000) {
        return "Business";
    }
    if (volume >=
        500000) {
        return "Premium";
    }
    return "Standard";
};
const getRevenueContributors = async ({ range, limit, }) => {
    const start = (0, exports.revenueRangeStart)(range);
    const rows = await RevenueEvent_js_1.RevenueEvent.aggregate([
        {
            $match: {
                occurredAt: {
                    $gte: start,
                },
                userId: {
                    $exists: true,
                },
                kind: {
                    $in: [
                        "TRANSFER_FEE",
                        "WITHDRAWAL_FEE",
                        "DEPOSIT_FEE",
                        "SERVICE_FEE",
                        "MERCHANT_FEE",
                    ],
                },
            },
        },
        {
            $group: {
                _id: "$userId",
                feesPaidMinor: {
                    $sum: "$feeMinor",
                },
                volumeMinor: {
                    $sum: "$volumeMinor",
                },
                transactionsCount: {
                    $sum: 1,
                },
            },
        },
        {
            $sort: {
                feesPaidMinor: -1,
            },
        },
        {
            $limit: limit,
        },
    ]);
    const userIds = rows.map((row) => row._id);
    const users = userIds.length >
        0
        ? await User_js_1.User.find({
            _id: {
                $in: userIds,
            },
            accountStatus: "active",
        })
            .select("name emailEncrypted")
            .lean()
        : [];
    const userMap = new Map(users.map((user) => [
        user._id.toString(),
        user,
    ]));
    return rows.map((row, index) => {
        const user = userMap.get(row._id.toString());
        return {
            id: `contributor-${index + 1}-${row._id.toString()}`,
            userId: row._id.toString(),
            name: user?.name ??
                "Unknown account",
            email: decryptEmail(user?.emailEncrypted),
            type: contributorType(row.volumeMinor),
            volumeMinor: row.volumeMinor,
            feesPaidMinor: row.feesPaidMinor,
            transactionsCount: row.transactionsCount,
        };
    });
};
exports.getRevenueContributors = getRevenueContributors;
const openLeakageInvestigation = async ({ category, range, note, adminId, }) => {
    const existing = await RevenueLeakageInvestigation_js_1.RevenueLeakageInvestigation.findOne({
        category,
        status: "investigating",
    })
        .sort({
        createdAt: -1,
    });
    if (existing) {
        return existing;
    }
    return RevenueLeakageInvestigation_js_1.RevenueLeakageInvestigation.create({
        category,
        range,
        note: note
            ?.trim()
            .slice(0, 500),
        openedBy: adminId,
        status: "investigating",
    });
};
exports.openLeakageInvestigation = openLeakageInvestigation;
