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
exports.BudgetExpense = exports.BudgetSavings = exports.BudgetSettings = exports.Budget = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const budgetSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types
            .ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    category: {
        type: String,
        required: true,
        trim: true,
        maxlength: 60,
    },
    iconName: {
        type: String,
        default: "MoreHorizontal",
        trim: true,
        maxlength: 40,
    },
    limitAmount: {
        type: Number,
        required: true,
        min: 0,
    },
    spentAmount: {
        type: Number,
        default: 0,
        min: 0,
    },
    month: {
        type: Number,
        required: true,
        min: 1,
        max: 12,
    },
    year: {
        type: Number,
        required: true,
        min: 2000,
        max: 3000,
    },
}, {
    timestamps: true,
});
budgetSchema.index({
    userId: 1,
    category: 1,
    month: 1,
    year: 1,
}, {
    unique: true,
});
const budgetSettingsSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types
            .ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    month: {
        type: Number,
        required: true,
        min: 1,
        max: 12,
    },
    year: {
        type: Number,
        required: true,
        min: 2000,
        max: 3000,
    },
    totalLimit: {
        type: Number,
        required: true,
        min: 1,
        default: 30000,
    },
}, {
    timestamps: true,
});
budgetSettingsSchema.index({
    userId: 1,
    month: 1,
    year: 1,
}, {
    unique: true,
});
const budgetSavingsSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types
            .ObjectId,
        ref: "User",
        required: true,
        unique: true,
        index: true,
    },
    savingsGoal: {
        type: Number,
        required: true,
        min: 1,
        default: 100000,
    },
    currentSavings: {
        type: Number,
        required: true,
        min: 0,
        default: 0,
    },
}, {
    timestamps: true,
});
const budgetExpenseSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types
            .ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    categoryId: {
        type: mongoose_1.Schema.Types
            .ObjectId,
        ref: "Budget",
        required: true,
        index: true,
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
    },
    amount: {
        type: Number,
        required: true,
        min: 0.01,
    },
    method: {
        type: String,
        trim: true,
        maxlength: 60,
        default: "Manual Entry",
    },
    date: {
        type: Date,
        required: true,
        default: Date.now,
    },
    month: {
        type: Number,
        required: true,
        min: 1,
        max: 12,
    },
    year: {
        type: Number,
        required: true,
        min: 2000,
        max: 3000,
    },
}, {
    timestamps: true,
});
budgetExpenseSchema.index({
    userId: 1,
    month: 1,
    year: 1,
    date: -1,
});
/* =========================================================
   MODELS
========================================================= */
exports.Budget = mongoose_1.default.models.Budget ||
    mongoose_1.default.model("Budget", budgetSchema);
exports.BudgetSettings = mongoose_1.default.models
    .BudgetSettings ||
    mongoose_1.default.model("BudgetSettings", budgetSettingsSchema);
exports.BudgetSavings = mongoose_1.default.models
    .BudgetSavings ||
    mongoose_1.default.model("BudgetSavings", budgetSavingsSchema);
exports.BudgetExpense = mongoose_1.default.models
    .BudgetExpense ||
    mongoose_1.default.model("BudgetExpense", budgetExpenseSchema);
exports.default = exports.Budget;
