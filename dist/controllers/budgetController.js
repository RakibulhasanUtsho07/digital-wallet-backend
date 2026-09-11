"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addBudgetExpense = exports.updateBudgetCategory = exports.addBudgetCategory = exports.addSavings = exports.updateBudgetSettings = exports.getBudgetDashboard = exports.getBudgets = exports.setBudget = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Budget_js_1 = require("../models/Budget.js");
/* =========================================================
   DEFAULTS
========================================================= */
const DEFAULT_TOTAL_LIMIT = 30000;
const DEFAULT_SAVINGS_GOAL = 100000;
const DEFAULT_CATEGORIES = [
    {
        category: "Food & Dining",
        iconName: "Utensils",
        limitAmount: 8000,
    },
    {
        category: "Shopping",
        iconName: "ShoppingBag",
        limitAmount: 5000,
    },
    {
        category: "Transport",
        iconName: "Car",
        limitAmount: 4000,
    },
    {
        category: "Bills & Utilities",
        iconName: "Zap",
        limitAmount: 6000,
    },
    {
        category: "Entertainment",
        iconName: "Film",
        limitAmount: 3000,
    },
];
const ALLOWED_ICONS = new Set([
    "Utensils",
    "ShoppingBag",
    "Car",
    "FileText",
    "Film",
    "Activity",
    "BookOpen",
    "Plane",
    "Zap",
    "MoreHorizontal",
]);
/* =========================================================
   HELPERS
========================================================= */
function setPrivateNoStore(res) {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
}
function getUserId(req) {
    return req.user?._id;
}
function getPeriod(monthValue, yearValue) {
    const now = new Date();
    const month = monthValue ===
        undefined ||
        monthValue ===
            null ||
        monthValue === ""
        ? now.getMonth() + 1
        : Number(monthValue);
    const year = yearValue ===
        undefined ||
        yearValue ===
            null ||
        yearValue === ""
        ? now.getFullYear()
        : Number(yearValue);
    if (!Number.isInteger(month) ||
        month < 1 ||
        month > 12 ||
        !Number.isInteger(year) ||
        year < 2000 ||
        year > 3000) {
        return null;
    }
    return {
        month,
        year,
    };
}
function positiveAmount(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) ||
        amount <= 0) {
        return null;
    }
    return Math.round(amount * 100) / 100;
}
function categoryDTO(budget) {
    return {
        id: String(budget._id),
        name: budget.category,
        iconName: budget.iconName ||
            "MoreHorizontal",
        limit: Number(budget.limitAmount ||
            0),
    };
}
function expenseDTO(expense) {
    return {
        id: String(expense._id),
        title: expense.title,
        amount: Number(expense.amount ||
            0),
        categoryId: String(expense.categoryId),
        date: new Date(expense.date).toISOString(),
        method: expense.method ||
            "Manual Entry",
    };
}
async function ensureDefaults(userId, month, year) {
    const [settings, savings, categoryCount,] = await Promise.all([
        Budget_js_1.BudgetSettings.findOneAndUpdate({
            userId,
            month,
            year,
        }, {
            $setOnInsert: {
                totalLimit: DEFAULT_TOTAL_LIMIT,
            },
        }, {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
        }),
        Budget_js_1.BudgetSavings.findOneAndUpdate({
            userId,
        }, {
            $setOnInsert: {
                savingsGoal: DEFAULT_SAVINGS_GOAL,
                currentSavings: 0,
            },
        }, {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
        }),
        Budget_js_1.Budget.countDocuments({
            userId,
            month,
            year,
        }),
    ]);
    if (!settings ||
        !savings) {
        throw new Error("Unable to initialize budget defaults.");
    }
    if (categoryCount === 0) {
        await Budget_js_1.Budget.bulkWrite(DEFAULT_CATEGORIES.map((item) => ({
            updateOne: {
                filter: {
                    userId,
                    month,
                    year,
                    category: item.category,
                },
                update: {
                    $setOnInsert: {
                        userId,
                        month,
                        year,
                        category: item.category,
                        iconName: item.iconName,
                        limitAmount: item.limitAmount,
                        spentAmount: 0,
                    },
                },
                upsert: true,
            },
        })));
    }
    return {
        settings,
        savings,
    };
}
/* =========================================================
   LEGACY-COMPATIBLE CATEGORY BUDGET ENDPOINTS
========================================================= */
// @desc    Create or update a category budget
// @route   POST /api/budgets
// @access  Private
const setBudget = async (req, res) => {
    try {
        setPrivateNoStore(res);
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({
                success: false,
                message: "Not authorized",
            });
            return;
        }
        const { category, limitAmount, month, year, iconName, } = req.body || {};
        const period = getPeriod(month, year);
        const limit = positiveAmount(limitAmount);
        const name = typeof category ===
            "string"
            ? category.trim()
            : "";
        if (!period ||
            !name ||
            name.length > 60 ||
            limit === null) {
            res.status(400).json({
                success: false,
                message: "Valid category, limitAmount, month, and year are required.",
            });
            return;
        }
        const safeIcon = typeof iconName ===
            "string" &&
            ALLOWED_ICONS.has(iconName)
            ? iconName
            : "MoreHorizontal";
        const budget = await Budget_js_1.Budget.findOneAndUpdate({
            userId,
            category: name,
            month: period.month,
            year: period.year,
        }, {
            $set: {
                limitAmount: limit,
                iconName: safeIcon,
            },
            $setOnInsert: {
                userId,
                category: name,
                month: period.month,
                year: period.year,
                spentAmount: 0,
            },
        }, {
            new: true,
            upsert: true,
            runValidators: true,
            setDefaultsOnInsert: true,
        });
        res.status(200).json({
            success: true,
            message: "Budget saved successfully.",
            budget: categoryDTO(budget),
        });
    }
    catch (error) {
        console.error("SET BUDGET ERROR:", error instanceof Error
            ? error.message
            : error);
        res.status(500).json({
            success: false,
            message: "Failed to save budget.",
        });
    }
};
exports.setBudget = setBudget;
// @desc    Get category budgets for month
// @route   GET /api/budgets?month=X&year=Y
// @access  Private
const getBudgets = async (req, res) => {
    try {
        setPrivateNoStore(res);
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({
                success: false,
                message: "Not authorized",
            });
            return;
        }
        const period = getPeriod(req.query.month, req.query.year);
        if (!period) {
            res.status(400).json({
                success: false,
                message: "Invalid month or year.",
            });
            return;
        }
        await ensureDefaults(userId, period.month, period.year);
        const budgets = await Budget_js_1.Budget.find({
            userId,
            month: period.month,
            year: period.year,
        })
            .sort({
            createdAt: 1,
        })
            .lean();
        res.status(200).json({
            success: true,
            count: budgets.length,
            month: period.month,
            year: period.year,
            budgets: budgets.map(categoryDTO),
        });
    }
    catch (error) {
        console.error("GET BUDGETS ERROR:", error instanceof Error
            ? error.message
            : error);
        res.status(500).json({
            success: false,
            message: "Failed to load budgets.",
        });
    }
};
exports.getBudgets = getBudgets;
/* =========================================================
   DASHBOARD
========================================================= */
// @desc    Get complete budgeting dashboard
// @route   GET /api/budgets/dashboard?month=X&year=Y
// @access  Private
const getBudgetDashboard = async (req, res) => {
    try {
        setPrivateNoStore(res);
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({
                success: false,
                message: "Not authorized",
            });
            return;
        }
        const period = getPeriod(req.query.month, req.query.year);
        if (!period) {
            res.status(400).json({
                success: false,
                message: "Invalid month or year.",
            });
            return;
        }
        const { settings, savings, } = await ensureDefaults(userId, period.month, period.year);
        const [categories, expenses,] = await Promise.all([
            Budget_js_1.Budget.find({
                userId,
                month: period.month,
                year: period.year,
            })
                .sort({
                createdAt: 1,
            })
                .lean(),
            Budget_js_1.BudgetExpense.find({
                userId,
                month: period.month,
                year: period.year,
            })
                .sort({
                date: -1,
                createdAt: -1,
            })
                .lean(),
        ]);
        res.status(200).json({
            success: true,
            month: period.month,
            year: period.year,
            settings: {
                totalLimit: Number(settings.totalLimit),
                savingsGoal: Number(savings.savingsGoal),
                currentSavings: Number(savings.currentSavings),
            },
            categories: categories.map(categoryDTO),
            expenses: expenses.map(expenseDTO),
        });
    }
    catch (error) {
        console.error("BUDGET DASHBOARD ERROR:", error instanceof Error
            ? error.message
            : error);
        res.status(500).json({
            success: false,
            message: "Failed to load budgeting dashboard.",
        });
    }
};
exports.getBudgetDashboard = getBudgetDashboard;
/* =========================================================
   SETTINGS
========================================================= */
// @desc    Update monthly total limit + savings goal
// @route   PUT /api/budgets/settings
// @access  Private
const updateBudgetSettings = async (req, res) => {
    try {
        setPrivateNoStore(res);
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({
                success: false,
                message: "Not authorized",
            });
            return;
        }
        const { month, year, totalLimit, savingsGoal, } = req.body || {};
        const period = getPeriod(month, year);
        const safeTotalLimit = positiveAmount(totalLimit);
        const safeSavingsGoal = positiveAmount(savingsGoal);
        if (!period ||
            safeTotalLimit ===
                null ||
            safeSavingsGoal ===
                null) {
            res.status(400).json({
                success: false,
                message: "Valid totalLimit, savingsGoal, month, and year are required.",
            });
            return;
        }
        const [settings, savings,] = await Promise.all([
            Budget_js_1.BudgetSettings.findOneAndUpdate({
                userId,
                month: period.month,
                year: period.year,
            }, {
                $set: {
                    totalLimit: safeTotalLimit,
                },
            }, {
                upsert: true,
                new: true,
                runValidators: true,
                setDefaultsOnInsert: true,
            }),
            Budget_js_1.BudgetSavings.findOneAndUpdate({
                userId,
            }, {
                $set: {
                    savingsGoal: safeSavingsGoal,
                },
                $setOnInsert: {
                    currentSavings: 0,
                },
            }, {
                upsert: true,
                new: true,
                runValidators: true,
                setDefaultsOnInsert: true,
            }),
        ]);
        if (!settings ||
            !savings) {
            throw new Error("Unable to save budget settings.");
        }
        res.status(200).json({
            success: true,
            message: "Budget settings updated.",
            settings: {
                totalLimit: Number(settings.totalLimit),
                savingsGoal: Number(savings.savingsGoal),
                currentSavings: Number(savings.currentSavings),
            },
        });
    }
    catch (error) {
        console.error("UPDATE BUDGET SETTINGS ERROR:", error instanceof Error
            ? error.message
            : error);
        res.status(500).json({
            success: false,
            message: "Failed to update budget settings.",
        });
    }
};
exports.updateBudgetSettings = updateBudgetSettings;
/* =========================================================
   SAVINGS
========================================================= */
// @desc    Add funds to budget savings tracker
// @route   POST /api/budgets/savings
// @access  Private
const addSavings = async (req, res) => {
    try {
        setPrivateNoStore(res);
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({
                success: false,
                message: "Not authorized",
            });
            return;
        }
        const amount = positiveAmount(req.body?.amount);
        if (amount === null) {
            res.status(400).json({
                success: false,
                message: "A valid savings amount is required.",
            });
            return;
        }
        const savings = await Budget_js_1.BudgetSavings.findOneAndUpdate({
            userId,
        }, {
            $inc: {
                currentSavings: amount,
            },
            $setOnInsert: {
                savingsGoal: DEFAULT_SAVINGS_GOAL,
            },
        }, {
            upsert: true,
            new: true,
            runValidators: true,
            setDefaultsOnInsert: true,
        });
        if (!savings) {
            throw new Error("Unable to save savings.");
        }
        res.status(200).json({
            success: true,
            message: "Savings updated.",
            savings: {
                savingsGoal: Number(savings.savingsGoal),
                currentSavings: Number(savings.currentSavings),
            },
        });
    }
    catch (error) {
        console.error("ADD SAVINGS ERROR:", error instanceof Error
            ? error.message
            : error);
        res.status(500).json({
            success: false,
            message: "Failed to update savings.",
        });
    }
};
exports.addSavings = addSavings;
/* =========================================================
   CATEGORIES
========================================================= */
// @desc    Add category
// @route   POST /api/budgets/categories
// @access  Private
const addBudgetCategory = async (req, res) => {
    try {
        setPrivateNoStore(res);
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({
                success: false,
                message: "Not authorized",
            });
            return;
        }
        const { month, year, name, limit, iconName, } = req.body || {};
        const period = getPeriod(month, year);
        const safeLimit = positiveAmount(limit);
        const safeName = typeof name ===
            "string"
            ? name.trim()
            : "";
        if (!period ||
            !safeName ||
            safeName.length >
                60 ||
            safeLimit === null) {
            res.status(400).json({
                success: false,
                message: "Valid category name, limit, month, and year are required.",
            });
            return;
        }
        const duplicate = await Budget_js_1.Budget.findOne({
            userId,
            month: period.month,
            year: period.year,
            category: {
                $regex: `^${safeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
                $options: "i",
            },
        })
            .select("_id")
            .lean();
        if (duplicate) {
            res.status(409).json({
                success: false,
                message: "A category with this name already exists.",
            });
            return;
        }
        const safeIcon = typeof iconName ===
            "string" &&
            ALLOWED_ICONS.has(iconName)
            ? iconName
            : "MoreHorizontal";
        const budget = await Budget_js_1.Budget.create({
            userId,
            category: safeName,
            iconName: safeIcon,
            limitAmount: safeLimit,
            spentAmount: 0,
            month: period.month,
            year: period.year,
        });
        res.status(201).json({
            success: true,
            message: "Category added.",
            category: categoryDTO(budget),
        });
    }
    catch (error) {
        if (error?.code ===
            11000) {
            res.status(409).json({
                success: false,
                message: "A category with this name already exists.",
            });
            return;
        }
        console.error("ADD BUDGET CATEGORY ERROR:", error instanceof Error
            ? error.message
            : error);
        res.status(500).json({
            success: false,
            message: "Failed to add category.",
        });
    }
};
exports.addBudgetCategory = addBudgetCategory;
// @desc    Update category limit
// @route   PATCH /api/budgets/categories/:id
// @access  Private
const updateBudgetCategory = async (req, res) => {
    try {
        setPrivateNoStore(res);
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({
                success: false,
                message: "Not authorized",
            });
            return;
        }
        const rawId = req.params.id;
        const id = Array.isArray(rawId)
            ? rawId[0]
            : rawId;
        if (typeof id !==
            "string" ||
            !mongoose_1.default.Types.ObjectId.isValid(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid category ID.",
            });
            return;
        }
        const period = getPeriod(req.body?.month, req.body?.year);
        const limit = positiveAmount(req.body?.limit);
        if (!period ||
            limit === null) {
            res.status(400).json({
                success: false,
                message: "Valid limit, month, and year are required.",
            });
            return;
        }
        const budget = await Budget_js_1.Budget.findOneAndUpdate({
            _id: id,
            userId,
            month: period.month,
            year: period.year,
        }, {
            $set: {
                limitAmount: limit,
            },
        }, {
            new: true,
            runValidators: true,
        });
        if (!budget) {
            res.status(404).json({
                success: false,
                message: "Budget category not found.",
            });
            return;
        }
        res.status(200).json({
            success: true,
            message: "Category limit updated.",
            category: categoryDTO(budget),
        });
    }
    catch (error) {
        console.error("UPDATE BUDGET CATEGORY ERROR:", error instanceof Error
            ? error.message
            : error);
        res.status(500).json({
            success: false,
            message: "Failed to update category.",
        });
    }
};
exports.updateBudgetCategory = updateBudgetCategory;
/* =========================================================
   EXPENSES
========================================================= */
// @desc    Add manual budget expense
// @route   POST /api/budgets/expenses
// @access  Private
const addBudgetExpense = async (req, res) => {
    try {
        setPrivateNoStore(res);
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({
                success: false,
                message: "Not authorized",
            });
            return;
        }
        const { title, amount, categoryId, month, year, method, } = req.body || {};
        const period = getPeriod(month, year);
        const safeAmount = positiveAmount(amount);
        const safeTitle = typeof title ===
            "string"
            ? title.trim()
            : "";
        if (!period ||
            !safeTitle ||
            safeTitle.length >
                120 ||
            safeAmount === null ||
            typeof categoryId !==
                "string" ||
            !mongoose_1.default.Types.ObjectId.isValid(categoryId)) {
            res.status(400).json({
                success: false,
                message: "Valid expense details are required.",
            });
            return;
        }
        const category = await Budget_js_1.Budget.findOne({
            _id: categoryId,
            userId,
            month: period.month,
            year: period.year,
        })
            .select("_id")
            .lean();
        if (!category) {
            res.status(404).json({
                success: false,
                message: "Budget category not found.",
            });
            return;
        }
        const expense = await Budget_js_1.BudgetExpense.create({
            userId,
            categoryId: category._id,
            title: safeTitle,
            amount: safeAmount,
            method: typeof method ===
                "string" &&
                method.trim()
                ? method
                    .trim()
                    .slice(0, 60)
                : "Manual Entry",
            date: new Date(),
            month: period.month,
            year: period.year,
        });
        res.status(201).json({
            success: true,
            message: "Expense added.",
            expense: expenseDTO(expense),
        });
    }
    catch (error) {
        console.error("ADD BUDGET EXPENSE ERROR:", error instanceof Error
            ? error.message
            : error);
        res.status(500).json({
            success: false,
            message: "Failed to add expense.",
        });
    }
};
exports.addBudgetExpense = addBudgetExpense;
