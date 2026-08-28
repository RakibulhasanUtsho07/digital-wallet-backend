"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBudgets = exports.setBudget = void 0;
const Budget_js_1 = require("../models/Budget.js");
// @desc    Create or update a budget
// @route   POST /api/budgets
// @access  Private
const setBudget = async (req, res) => {
    try {
        const { category, limitAmount, month, year } = req.body;
        const userId = req.user?._id;
        if (!category || !limitAmount || !month || !year) {
            res.status(400).json({ message: "All fields are required" });
            return;
        }
        let budget = await Budget_js_1.Budget.findOne({ userId, category, month, year });
        if (budget) {
            budget.limitAmount = limitAmount;
            await budget.save();
            res.status(200).json({ success: true, message: "Budget updated successfully", budget });
            return;
        }
        budget = await Budget_js_1.Budget.create({
            userId,
            category,
            limitAmount,
            month,
            year,
        });
        res.status(201).json({ success: true, message: "Budget created successfully", budget });
    }
    catch (error) {
        if (error.code === 11000) {
            res.status(400).json({ message: "Budget for this category and month already exists." });
        }
        else {
            res.status(500).json({ message: error.message });
        }
    }
};
exports.setBudget = setBudget;
// @desc    Get user's budgets for a specific month
// @route   GET /api/budgets?month=X&year=Y
// @access  Private
const getBudgets = async (req, res) => {
    try {
        const userId = req.user?._id;
        const month = req.query.month ? Number(req.query.month) : new Date().getMonth() + 1;
        const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
        const budgets = await Budget_js_1.Budget.find({ userId, month, year });
        res.status(200).json({ success: true, count: budgets.length, month, year, budgets });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getBudgets = getBudgets;
