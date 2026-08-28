"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserProfile = void 0;
const User_js_1 = require("../models/User.js");
const Wallet_js_1 = require("../models/Wallet.js");
/* =========================================================
   GET LOGGED-IN USER PROFILE
   GET /api/users/profile
   Private
========================================================= */
const getUserProfile = async (req, res) => {
    try {
        if (!req.user?._id) {
            res.status(401).json({
                success: false,
                message: "Not authorized",
            });
            return;
        }
        const user = await User_js_1.User.findById(req.user._id)
            .select("-password");
        if (!user) {
            res.status(404).json({
                success: false,
                message: "User not found",
            });
            return;
        }
        const wallet = await Wallet_js_1.Wallet.findOne({
            userId: user._id,
        });
        res.status(200).json({
            success: true,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                kycStatus: user.kycStatus,
                createdAt: user.createdAt,
            },
            wallet: wallet
                ? {
                    balance: wallet.balance,
                    status: wallet.status,
                }
                : null,
        });
    }
    catch (error) {
        console.error("Get profile error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to get user profile",
        });
    }
};
exports.getUserProfile = getUserProfile;
