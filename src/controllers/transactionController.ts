import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import { Transaction } from "../models/Transaction.js";

// @desc    Get logged in user's transactions
// @route   GET /api/transactions
// @access  Private
export const getMyTransactions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;

    // Fetch transactions where the user is either the sender or receiver
    const transactions = await Transaction.find({
      $or: [{ senderId: userId }, { receiverId: userId }],
    }).sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: transactions.length, transactions });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get transaction details by ID
// @route   GET /api/transactions/:id
// @access  Private
export const getTransactionById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?._id;

    const transaction = await Transaction.findById(id)
      .populate("senderId", "name email")
      .populate("receiverId", "name email");

    if (!transaction) {
      res.status(404).json({ message: "Transaction not found" });
      return;
    }

    // Ensure the user is authorized to view this transaction
    const isSender = transaction.senderId._id.toString() === userId?.toString();
    const isReceiver = transaction.receiverId._id.toString() === userId?.toString();

    if (!isSender && !isReceiver) {
      res.status(403).json({ message: "Not authorized to view this transaction" });
      return;
    }

    res.status(200).json({ success: true, transaction });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};