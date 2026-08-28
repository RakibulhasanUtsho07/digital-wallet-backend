"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyWallet = void 0;
const Wallet_js_1 = require("../models/Wallet.js");
// @desc    Get user wallet details
// @route   GET /api/wallet
// @access  Private
const getMyWallet = async (req, res) => {
    try {
        const userId = req.user?._id;
        const wallet = await Wallet_js_1.Wallet.findOne({ userId });
        if (!wallet) {
            res.status(404).json({ message: "Wallet not found" });
            return;
        }
        res.status(200).json({ success: true, wallet });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getMyWallet = getMyWallet;
