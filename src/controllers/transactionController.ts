import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import { Transaction } from "../models/Transaction.js";

// @desc    Get user's transaction history
// @route   GET /api/transactions/history
// @access  Private
export const getTransactionHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;

    // ডাটাবেজ থেকে ইউজারের সেন্ড করা বা রিসিভ করা সব ট্রানজেকশন খুঁজে বের করা
    const transactions = await Transaction.find({
      $or: [{ senderId: userId }, { receiverId: userId }],
    })
      .populate("senderId", "name phone") // সেন্ডারের নাম ও ফোন নাম্বার পপুলেট করা
      .populate("receiverId", "name phone") // রিসিভারের নাম ও ফোন নাম্বার পপুলেট করা
      .sort({ createdAt: -1 }); // নতুন ট্রানজেকশনগুলো আগে দেখানোর জন্য

    res.status(200).json({
      success: true,
      count: transactions.length,
      transactions,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};