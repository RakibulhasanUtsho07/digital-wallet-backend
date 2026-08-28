"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTransactionById = exports.getMyTransactions = void 0;
const Transaction_js_1 = require("../models/Transaction.js");
/* =========================================================
   GET MY TRANSACTIONS
   GET /api/transactions
========================================================= */
const getMyTransactions = async (req, res) => {
    try {
        if (!req.user?._id) {
            res.status(401).json({
                success: false,
                message: "Not authorized",
            });
            return;
        }
        const userId = req.user._id;
        const transactions = await Transaction_js_1.Transaction.find({
            $or: [
                {
                    senderId: userId,
                },
                {
                    receiverId: userId,
                },
            ],
        })
            .populate("senderId", "name email")
            .populate("receiverId", "name email")
            .sort({
            createdAt: -1,
        });
        res.status(200).json({
            success: true,
            count: transactions.length,
            transactions,
        });
    }
    catch (error) {
        console.error("Get transactions error:", error);
        res.status(500).json({
            success: false,
            message: error instanceof Error
                ? error.message
                : "Failed to fetch transactions.",
        });
    }
};
exports.getMyTransactions = getMyTransactions;
/* =========================================================
   GET TRANSACTION BY ID
   GET /api/transactions/:id
========================================================= */
const getTransactionById = async (req, res) => {
    try {
        if (!req.user?._id) {
            res.status(401).json({
                success: false,
                message: "Not authorized",
            });
            return;
        }
        const { id } = req.params;
        const userId = req.user._id.toString();
        const transaction = await Transaction_js_1.Transaction.findById(id)
            .populate("senderId", "name email")
            .populate("receiverId", "name email");
        if (!transaction) {
            res.status(404).json({
                success: false,
                message: "Transaction not found",
            });
            return;
        }
        /* =====================================================
           AUTHORIZATION
        ====================================================== */
        const senderId = getPopulatedUserId(transaction.senderId);
        const receiverId = getPopulatedUserId(transaction.receiverId);
        const isSender = senderId === userId;
        const isReceiver = receiverId === userId;
        if (!isSender &&
            !isReceiver) {
            res.status(403).json({
                success: false,
                message: "Not authorized to view this transaction",
            });
            return;
        }
        res.status(200).json({
            success: true,
            transaction,
        });
    }
    catch (error) {
        console.error("Get transaction details error:", error);
        res.status(500).json({
            success: false,
            message: error instanceof Error
                ? error.message
                : "Failed to fetch transaction.",
        });
    }
};
exports.getTransactionById = getTransactionById;
/* =========================================================
   HELPER
========================================================= */
function getPopulatedUserId(value) {
    if (!value) {
        return "";
    }
    if (typeof value === "string") {
        return value;
    }
    if (typeof value === "object" &&
        value !== null &&
        "_id" in value) {
        return String(value
            ._id);
    }
    return String(value);
}
