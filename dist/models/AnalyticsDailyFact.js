"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsDailyFact = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const analyticsDailyFactSchema = new mongoose_1.Schema({
    dateKey: {
        type: String,
        required: true,
        unique: true,
        trim: true,
    },
    transaction: {
        volumeMinor: {
            type: Number,
            default: 0,
            min: 0,
        },
        count: {
            type: Number,
            default: 0,
            min: 0,
        },
        failedCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        averageValueMinor: {
            type: Number,
            default: 0,
            min: 0,
        },
    },
    revenue: {
        platformRevenueMinor: {
            type: Number,
            default: 0,
            min: 0,
        },
        merchantRevenueMinor: {
            type: Number,
            default: 0,
            min: 0,
        },
        transferRevenueMinor: {
            type: Number,
            default: 0,
            min: 0,
        },
        withdrawalRevenueMinor: {
            type: Number,
            default: 0,
            min: 0,
        },
    },
    users: {
        activeUsers: {
            type: Number,
            default: 0,
            min: 0,
        },
        newUsers: {
            type: Number,
            default: 0,
            min: 0,
        },
        retainedUsers: {
            type: Number,
            default: 0,
            min: 0,
        },
        kycCompletedUsers: {
            type: Number,
            default: 0,
            min: 0,
        },
        totalEligibleUsers: {
            type: Number,
            default: 0,
            min: 0,
        },
    },
    wallet: {
        aggregateBalanceMinor: {
            type: Number,
            default: 0,
            min: 0,
        },
    },
    channels: {
        transferCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        merchantCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        cashInCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        cashOutCount: {
            type: Number,
            default: 0,
            min: 0,
        },
    },
    failures: {
        gatewayTimeout: {
            type: Number,
            default: 0,
            min: 0,
        },
        insufficientFunds: {
            type: Number,
            default: 0,
            min: 0,
        },
        riskBlocked: {
            type: Number,
            default: 0,
            min: 0,
        },
        bankRejected: {
            type: Number,
            default: 0,
            min: 0,
        },
        other: {
            type: Number,
            default: 0,
            min: 0,
        },
    },
    risk: {
        lowCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        monitoredCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        highCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        criticalCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        lowExposureMinor: {
            type: Number,
            default: 0,
            min: 0,
        },
        monitoredExposureMinor: {
            type: Number,
            default: 0,
            min: 0,
        },
        highExposureMinor: {
            type: Number,
            default: 0,
            min: 0,
        },
        criticalExposureMinor: {
            type: Number,
            default: 0,
            min: 0,
        },
    },
    geography: {
        type: [
            {
                _id: false,
                region: {
                    type: String,
                    required: true,
                    trim: true,
                    maxlength: 80,
                },
                transactionCount: {
                    type: Number,
                    default: 0,
                    min: 0,
                },
                volumeMinor: {
                    type: Number,
                    default: 0,
                    min: 0,
                },
            },
        ],
        default: [],
    },
    generatedAt: {
        type: Date,
        default: Date.now,
        index: true,
    },
}, {
    timestamps: true,
    versionKey: false,
    strict: "throw",
    minimize: false,
});
analyticsDailyFactSchema.index({
    dateKey: 1,
    generatedAt: -1,
});
exports.AnalyticsDailyFact = mongoose_1.default.models.AnalyticsDailyFact ||
    mongoose_1.default.model("AnalyticsDailyFact", analyticsDailyFactSchema);
exports.default = exports.AnalyticsDailyFact;
