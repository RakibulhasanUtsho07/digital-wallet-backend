"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReceipts = exports.addReceipt = void 0;
const Receipt_js_1 = require("../models/Receipt.js");
// @desc    Add a new receipt (Manual or Post-AI Parsing)
// @route   POST /api/receipts
// @access  Private
const addReceipt = async (req, res) => {
    try {
        const { merchantName, amount, category, receiptDate, imageUrl, isAiParsed } = req.body;
        const userId = req.user?._id;
        if (!merchantName || !amount) {
            res.status(400).json({ message: "Merchant name and amount are required" });
            return;
        }
        const receipt = await Receipt_js_1.Receipt.create({
            userId,
            merchantName,
            amount,
            category,
            receiptDate: receiptDate || new Date(),
            imageUrl,
            isAiParsed: isAiParsed || false,
        });
        res.status(201).json({ success: true, message: "Receipt saved successfully", receipt });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.addReceipt = addReceipt;
// @desc    Get user's receipts
// @route   GET /api/receipts
// @access  Private
const getReceipts = async (req, res) => {
    try {
        const userId = req.user?._id;
        const receipts = await Receipt_js_1.Receipt.find({ userId }).sort({ receiptDate: -1 });
        res.status(200).json({ success: true, count: receipts.length, receipts });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getReceipts = getReceipts;
