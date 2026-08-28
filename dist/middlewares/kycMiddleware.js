"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireVerifiedKYC = void 0;
const User_js_1 = require("../models/User.js");
const requireVerifiedKYC = async (req, res, next) => {
    try {
        if (!req.user?._id) {
            res.status(401).json({
                success: false,
                message: "Not authorized",
            });
            return;
        }
        const user = await User_js_1.User.findById(req.user._id).select("kycStatus");
        if (!user) {
            res.status(404).json({
                success: false,
                message: "User not found",
            });
            return;
        }
        if (user.kycStatus !== "verified") {
            res.status(403).json({
                success: false,
                message: "KYC verification is required for this action.",
                kycStatus: user.kycStatus,
            });
            return;
        }
        next();
    }
    catch (error) {
        console.error("KYC middleware error:", error);
        res.status(500).json({
            success: false,
            message: "KYC verification check failed",
        });
    }
};
exports.requireVerifiedKYC = requireVerifiedKYC;
