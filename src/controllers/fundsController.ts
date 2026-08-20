import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import { Wallet } from "../models/Wallet.js";
import { Transaction } from "../models/Transaction.js";

// @desc    Deposit / Add Funds to Wallet
// @route   POST /api/funds/deposit
// @access  Private
export const depositFunds = async (req: AuthRequest, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { amount, reference } = req.body;
    const userId = req.user?._id;

    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      await session.abortTransaction();
      res.status(400).json({ message: "Invalid deposit amount" });
      return;
    }

    const wallet = await Wallet.findOne({ userId }).session(session);
    if (!wallet) {
      await session.abortTransaction();
      res.status(404).json({ message: "Wallet not found" });
      return;
    }

    wallet.balance += parsedAmount;
    await wallet.save({ session });

    const transaction = await Transaction.create(
      [
        {
          senderId: userId,
          receiverId: userId,
          amount: parsedAmount,
          type: "DEPOSIT",
          status: "COMPLETED",
          reference: reference || "Add Funds / Deposit",
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: "Funds added successfully",
      balance: wallet.balance,
      transaction: transaction[0],
    });
  } catch (error: any) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: error.message });
  }
};

// @desc    Withdraw Funds from Wallet
// @route   POST /api/funds/withdraw
// @access  Private
export const withdrawFunds = async (req: AuthRequest, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { amount, reference } = req.body;
    const userId = req.user?._id;

    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      await session.abortTransaction();
      res.status(400).json({ message: "Invalid withdraw amount" });
      return;
    }

    const wallet = await Wallet.findOne({ userId }).session(session);
    if (!wallet || wallet.balance < parsedAmount) {
      await session.abortTransaction();
      res.status(400).json({ message: "Insufficient balance" });
      return;
    }

    wallet.balance -= parsedAmount;
    await wallet.save({ session });

    const transaction = await Transaction.create(
      [
        {
          senderId: userId,
          receiverId: userId,
          amount: parsedAmount,
          type: "WITHDRAW",
          status: "COMPLETED",
          reference: reference || "Withdraw Funds",
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: "Withdrawal successful",
      balance: wallet.balance,
      transaction: transaction[0],
    });
  } catch (error: any) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: error.message });
  }
};