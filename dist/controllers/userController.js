"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserPreferences = exports.getUserPreferences = exports.getUserProfile = void 0;
const User_js_1 = require("../models/User.js");
const Wallet_js_1 = require("../models/Wallet.js");
const crypto_js_1 = require("../utils/crypto.js");
const safeDecrypt = (value) => {
    if (!value) {
        return "";
    }
    try {
        return (0, crypto_js_1.decryptData)(value);
    }
    catch (error) {
        console.error("PROFILE CONTACT DECRYPT ERROR:", error);
        return "";
    }
};
/* =========================================================
   THEME VALIDATION
========================================================= */
const VALID_THEMES = [
    "light",
    "dark",
    "eye-care",
    "ocean",
    "forest",
];
const isValidTheme = (value) => {
    return (typeof value === "string" &&
        VALID_THEMES.includes(value));
};
/* =========================================================
   GET LOGGED-IN USER PROFILE
   GET /api/users/profile
   Private
========================================================= */
const getUserProfile = async (req, res) => {
    try {
        /* =====================================================
           AUTH
        ====================================================== */
        if (!req.user?._id) {
            res.status(401).json({
                success: false,
                message: "Not authorized",
            });
            return;
        }
        /* =====================================================
           USER
        ====================================================== */
        const user = await User_js_1.User.findById(req.user._id).select("-password");
        if (!user) {
            res.status(404).json({
                success: false,
                message: "User not found",
            });
            return;
        }
        /* =====================================================
           DECRYPT CONTACT DATA
        ====================================================== */
        const email = safeDecrypt(user.emailEncrypted);
        const phone = safeDecrypt(user.phoneEncrypted);
        /* =====================================================
           WALLET
        ====================================================== */
        const wallet = await Wallet_js_1.Wallet.findOne({
            userId: user._id,
        });
        /* =====================================================
           RESPONSE
        ====================================================== */
        res.status(200).json({
            success: true,
            user: {
                _id: user._id,
                name: user.name,
                email,
                phone,
                role: user.role,
                kycStatus: user.kycStatus,
                createdAt: user.createdAt,
                preferences: {
                    theme: user.preferences
                        ?.theme ??
                        "light",
                },
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
        console.error("GET PROFILE ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to get user profile",
        });
    }
};
exports.getUserProfile = getUserProfile;
/* =========================================================
   GET USER PREFERENCES
   GET /api/users/preferences
   Private
========================================================= */
const getUserPreferences = async (req, res) => {
    try {
        /* =====================================================
           AUTH
        ====================================================== */
        if (!req.user?._id) {
            res.status(401).json({
                success: false,
                message: "Not authorized",
            });
            return;
        }
        /* =====================================================
           USER
        ====================================================== */
        const user = await User_js_1.User.findById(req.user._id).select("preferences");
        if (!user) {
            res.status(404).json({
                success: false,
                message: "User not found",
            });
            return;
        }
        /* =====================================================
           RESPONSE
        ====================================================== */
        res.status(200).json({
            success: true,
            preferences: {
                theme: user.preferences
                    ?.theme ??
                    "light",
            },
        });
    }
    catch (error) {
        console.error("GET USER PREFERENCES ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to get user preferences",
        });
    }
};
exports.getUserPreferences = getUserPreferences;
/* =========================================================
   UPDATE USER PREFERENCES
   PATCH /api/users/preferences
   Private
========================================================= */
const updateUserPreferences = async (req, res) => {
    try {
        /* =====================================================
           AUTH
        ====================================================== */
        if (!req.user?._id) {
            res.status(401).json({
                success: false,
                message: "Not authorized",
            });
            return;
        }
        /* =====================================================
           INPUT
        ====================================================== */
        const { theme, } = req.body ?? {};
        /* =====================================================
           VALIDATE THEME
        ====================================================== */
        if (theme !==
            undefined &&
            !isValidTheme(theme)) {
            res.status(400).json({
                success: false,
                message: "Invalid theme. Allowed themes are light, dark, eye-care, ocean and forest.",
            });
            return;
        }
        /*
         * At least one supported preference must
         * be provided.
         */
        if (theme === undefined) {
            res.status(400).json({
                success: false,
                message: "No valid preference was provided.",
            });
            return;
        }
        /* =====================================================
           UPDATE
        ====================================================== */
        const updatedUser = await User_js_1.User.findByIdAndUpdate(req.user._id, {
            $set: {
                "preferences.theme": theme,
            },
        }, {
            new: true,
            runValidators: true,
        }).select("preferences");
        if (!updatedUser) {
            res.status(404).json({
                success: false,
                message: "User not found",
            });
            return;
        }
        /* =====================================================
           RESPONSE
        ====================================================== */
        res.status(200).json({
            success: true,
            message: "User preferences updated successfully.",
            preferences: {
                theme: updatedUser
                    .preferences
                    ?.theme ??
                    "light",
            },
        });
    }
    catch (error) {
        console.error("UPDATE USER PREFERENCES ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update user preferences",
        });
    }
};
exports.updateUserPreferences = updateUserPreferences;
