"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireWalletNotFrozen = void 0;
const WalletSecurityLock_js_1 = require("../models/WalletSecurityLock.js");
/*
 * Add this middleware to outbound-money routes such as
 * Send Money and Withdraw. Deposits may remain allowed.
 */
const requireWalletNotFrozen = async (req, res, next) => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: "Not authorized.",
            });
            return;
        }
        const lock = await WalletSecurityLock_js_1.WalletSecurityLock.findOne({
            userId,
            frozen: true,
        }).select("frozen reason frozenAt");
        if (lock?.frozen) {
            res.status(423).json({
                success: false,
                code: "WALLET_SECURITY_FROZEN",
                message: "Outbound wallet activity is frozen from Security Center.",
                frozenAt: lock.frozenAt,
            });
            return;
        }
        next();
    }
    catch (error) {
        console.error("WALLET SECURITY CHECK ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Unable to verify wallet security state.",
        });
    }
};
exports.requireWalletNotFrozen = requireWalletNotFrozen;
