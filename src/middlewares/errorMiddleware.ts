import { Request, Response } from "express";
import mongoose from "mongoose";
import { Wallet } from "../models/Wallet.js";
import { User } from "../models/User.js";
import { Transaction } from "../models/Transaction.js";

export const sendMoney = async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { recipientPhone, amount, reference } = req.body;
    const senderId = req.user?._id;

    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      await session.abortTransaction();
      res.status(400).json({ message: "Invalid transfer amount" });
      return;
    }

    const recipient = await User.findOne({ phone: recipientPhone }).session(session);
    if (!recipient) {
      await session.abortTransaction();
      res.status(404).json({ message: "Recipient user not found" });
      return;
    }

    if (recipient._id.toString() === senderId) {
      await session.abortTransaction();
      res.status(400).json({ message: "You cannot transfer money to yourself" });
      return;
    }

    const senderWallet = await Wallet.findOne({ userId: senderId }).session(session);
    if (!senderWallet || senderWallet.balance < parsedAmount) {
      await session.abortTransaction();
      res.status(400).json({ message: "Insufficient balance" });
      return;
    }

    const recipientWallet = await Wallet.findOne({ userId: recipient._id }).session(session);
    if (!recipientWallet) {
      await session.abortTransaction();
      res.status(404).json({ message: "Recipient wallet not found" });
      return;
    }

    senderWallet.balance -= parsedAmount;
    recipientWallet.balance += parsedAmount;

    await senderWallet.save({ session });
    await recipientWallet.save({ session });

    const transaction = await Transaction.create(
      [
        {
          senderId,
          receiverId: recipient._id,
          amount: parsedAmount,
          type: "TRANSFER",
          status: "COMPLETED",
          reference: reference || "Send Money",
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: "Transfer completed successfully",
      transaction: transaction[0],
    });
  } catch (error: any) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: error.message });
  }
};