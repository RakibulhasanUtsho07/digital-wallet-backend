"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMoney = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Wallet_js_1 = require("../models/Wallet.js");
const User_js_1 = require("../models/User.js");
const Transaction_js_1 = require("../models/Transaction.js");
// Request-এর বদলে AuthRequest
const sendMoney = async (req, res) => {
    const session = await mongoose_1.default.startSession();
    session.startTransaction();
    try {
        const { recipientPhone, amount, reference } = req.body;
        // এখন req.user এরর দেবে না
        const senderId = req.user?._id;
        const parsedAmount = Number(amount);
        if (!parsedAmount || parsedAmount <= 0) {
            await session.abortTransaction();
            res.status(400).json({ message: "Invalid transfer amount" });
            return;
        }
        const recipient = await User_js_1.User.findOne({ phone: recipientPhone }).session(session);
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
        const senderWallet = await Wallet_js_1.Wallet.findOne({ userId: senderId }).session(session);
        if (!senderWallet || senderWallet.balance < parsedAmount) {
            await session.abortTransaction();
            res.status(400).json({ message: "Insufficient balance" });
            return;
        }
        const recipientWallet = await Wallet_js_1.Wallet.findOne({ userId: recipient._id }).session(session);
        if (!recipientWallet) {
            await session.abortTransaction();
            res.status(404).json({ message: "Recipient wallet not found" });
            return;
        }
        senderWallet.balance -= parsedAmount;
        recipientWallet.balance += parsedAmount;
        await senderWallet.save({ session });
        await recipientWallet.save({ session });
        const transaction = await Transaction_js_1.Transaction.create([
            {
                senderId,
                receiverId: recipient._id,
                amount: parsedAmount,
                type: "TRANSFER",
                status: "COMPLETED",
                reference: reference || "Send Money",
            },
        ], { session });
        await session.commitTransaction();
        session.endSession();
        res.status(200).json({
            message: "Transfer completed successfully",
            transaction: transaction[0],
        });
    }
    catch (error) {
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({ message: error.message });
    }
};
exports.sendMoney = sendMoney;
