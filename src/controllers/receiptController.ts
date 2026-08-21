import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import { Receipt } from "../models/Receipt.js";

// @desc    Add a new receipt (Manual or Post-AI Parsing)
// @route   POST /api/receipts
// @access  Private
export const addReceipt = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { merchantName, amount, category, receiptDate, imageUrl, isAiParsed } = req.body;
    const userId = req.user?._id;

    if (!merchantName || !amount) {
      res.status(400).json({ message: "Merchant name and amount are required" });
      return;
    }

    const receipt = await Receipt.create({
      userId,
      merchantName,
      amount,
      category,
      receiptDate: receiptDate || new Date(),
      imageUrl,
      isAiParsed: isAiParsed || false,
    });

    res.status(201).json({ success: true, message: "Receipt saved successfully", receipt });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user's receipts
// @route   GET /api/receipts
// @access  Private
export const getReceipts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    const receipts = await Receipt.find({ userId }).sort({ receiptDate: -1 });

    res.status(200).json({ success: true, count: receipts.length, receipts });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};