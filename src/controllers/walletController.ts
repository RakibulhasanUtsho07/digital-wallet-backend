import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import { Wallet } from "../models/Wallet.js";

export const getWalletBalance = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const wallet = await Wallet.findOne({ userId: req.user?._id });
    if (!wallet) {
      res.status(404).json({ message: "Wallet not found" });
      return;
    }

    res.status(200).json({
      balance: wallet.balance,
      pendingBalance: wallet.pendingBalance,
      currency: wallet.currency,
      status: wallet.status,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};