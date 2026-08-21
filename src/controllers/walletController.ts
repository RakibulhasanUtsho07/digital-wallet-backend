import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import { Wallet } from "../models/Wallet.js";

// @desc    Get user wallet details
// @route   GET /api/wallet
// @access  Private
export const getMyWallet = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    const wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      res.status(404).json({ message: "Wallet not found" });
      return;
    }

    res.status(200).json({ success: true, wallet });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};