"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logoutUser = exports.loginUser = exports.registerUser = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_js_1 = require("../models/User.js");
const Wallet_js_1 = require("../models/Wallet.js");
const password_js_1 = require("../utils/password.js");
/* =========================================================
   JWT GENERATOR
========================================================= */
const generateToken = (id, role) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error("JWT_SECRET is not defined in .env");
    }
    return jsonwebtoken_1.default.sign({
        id,
        role,
    }, secret, {
        expiresIn: "30d",
    });
};
/* =========================================================
   SET AUTH COOKIE
========================================================= */
const setAuthCookie = (res, token) => {
    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("access_token", token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction
            ? "none"
            : "lax",
        maxAge: 30 *
            24 *
            60 *
            60 *
            1000,
        path: "/",
    });
};
/* =========================================================
   REGISTER USER
   POST /api/auth/register
========================================================= */
const registerUser = async (req, res) => {
    let createdUserId = null;
    try {
        const { name, email, phone, password, } = req.body;
        console.log("REGISTER REQUEST:", {
            name,
            email,
            phone,
            passwordProvided: Boolean(password),
        });
        /* =====================================================
           NORMALIZE
        ====================================================== */
        const normalizedName = typeof name === "string"
            ? name.trim()
            : "";
        const normalizedEmail = typeof email === "string"
            ? email.trim().toLowerCase()
            : "";
        const normalizedPhone = typeof phone === "string"
            ? phone.trim()
            : "";
        const normalizedPassword = typeof password === "string"
            ? password
            : "";
        /* =====================================================
           VALIDATION
        ====================================================== */
        if (!normalizedName ||
            !normalizedEmail ||
            !normalizedPassword) {
            res.status(400).json({
                success: false,
                message: "Name, email and password are required.",
            });
            return;
        }
        if (normalizedPassword.length < 6) {
            res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters.",
            });
            return;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normalizedEmail)) {
            res.status(400).json({
                success: false,
                message: "Please provide a valid email address.",
            });
            return;
        }
        /* =====================================================
           CHECK EXISTING USER
        ====================================================== */
        const existingByEmail = await User_js_1.User.findOne({
            email: normalizedEmail,
        });
        if (existingByEmail) {
            res.status(409).json({
                success: false,
                message: "An account with this email already exists.",
            });
            return;
        }
        if (normalizedPhone) {
            const existingByPhone = await User_js_1.User.findOne({
                phone: normalizedPhone,
            });
            if (existingByPhone) {
                res.status(409).json({
                    success: false,
                    message: "An account with this phone number already exists.",
                });
                return;
            }
        }
        console.log("REGISTER STEP 1: Validation passed");
        /* =====================================================
           HASH PASSWORD
        ====================================================== */
        const hashedPassword = await (0, password_js_1.hashPassword)(normalizedPassword);
        console.log("REGISTER STEP 2: Password hashed");
        /* =====================================================
           CREATE USER
        ====================================================== */
        const user = await User_js_1.User.create({
            name: normalizedName,
            email: normalizedEmail,
            phone: normalizedPhone ||
                undefined,
            password: hashedPassword,
        });
        createdUserId =
            user._id.toString();
        console.log("REGISTER STEP 3: User created:", createdUserId);
        /* =====================================================
           CREATE WALLET
        ====================================================== */
        let wallet;
        try {
            wallet =
                await Wallet_js_1.Wallet.create({
                    userId: user._id,
                    balance: 0,
                });
        }
        catch (walletError) {
            console.error("WALLET CREATE ERROR:", walletError);
            /*
             * Roll back the user so we don't leave
             * an account without a wallet.
             */
            await User_js_1.User.deleteOne({
                _id: user._id,
            });
            createdUserId = null;
            throw new Error("Wallet creation failed.");
        }
        console.log("REGISTER STEP 4: Wallet created:", wallet._id.toString());
        /* =====================================================
           LINK WALLET TO USER
        ====================================================== */
        user.walletId =
            wallet._id;
        await user.save();
        console.log("REGISTER STEP 5: Wallet linked to user");
        /* =====================================================
           GENERATE TOKEN
        ====================================================== */
        const token = generateToken(user._id.toString(), user.role);
        console.log("REGISTER STEP 6: JWT generated");
        /* =====================================================
           SET COOKIE
        ====================================================== */
        setAuthCookie(res, token);
        console.log("REGISTER STEP 7: Auth cookie set");
        /* =====================================================
           SUCCESS RESPONSE
        ====================================================== */
        res.status(201).json({
            success: true,
            message: "User registered successfully.",
            user: {
                _id: user._id.toString(),
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                kycStatus: user.kycStatus,
            },
        });
        console.log("REGISTER SUCCESS:", user.email);
    }
    catch (error) {
        console.error("REGISTER ERROR:", error);
        /*
         * Duplicate key protection
         */
        if (typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code ===
                11000) {
            res.status(409).json({
                success: false,
                message: "An account with this email or phone already exists.",
            });
            return;
        }
        const isDevelopment = process.env.NODE_ENV !==
            "production";
        res.status(500).json({
            success: false,
            message: "Registration failed. Please try again.",
            ...(isDevelopment &&
                error instanceof Error
                ? {
                    debug: error.message,
                }
                : {}),
        });
    }
};
exports.registerUser = registerUser;
/* =========================================================
   LOGIN USER
   POST /api/auth/login
========================================================= */
const loginUser = async (req, res) => {
    try {
        const { email, password, } = req.body;
        console.log("LOGIN REQUEST:", {
            email,
            passwordProvided: Boolean(password),
        });
        /* =====================================================
           NORMALIZE
        ====================================================== */
        const normalizedEmail = typeof email === "string"
            ? email.trim().toLowerCase()
            : "";
        const normalizedPassword = typeof password === "string"
            ? password
            : "";
        /* =====================================================
           VALIDATION
        ====================================================== */
        if (!normalizedEmail ||
            !normalizedPassword) {
            res.status(400).json({
                success: false,
                message: "Email and password are required.",
            });
            return;
        }
        /* =====================================================
           FIND USER
        ====================================================== */
        const user = await User_js_1.User.findOne({
            email: normalizedEmail,
        }).select("+password");
        if (!user) {
            console.log("LOGIN FAILED: no user for", normalizedEmail);
            res.status(401).json({
                success: false,
                message: "Invalid email or password.",
            });
            return;
        }
        /* =====================================================
           GET HASH
        ====================================================== */
        const storedPassword = user.get("password");
        if (!storedPassword) {
            res.status(401).json({
                success: false,
                message: "Invalid email or password.",
            });
            return;
        }
        /* =====================================================
           VERIFY ARGON2
        ====================================================== */
        const passwordMatched = await (0, password_js_1.verifyPassword)(storedPassword, normalizedPassword);
        if (!passwordMatched) {
            console.log("LOGIN FAILED: bad password for", normalizedEmail);
            res.status(401).json({
                success: false,
                message: "Invalid email or password.",
            });
            return;
        }
        console.log("LOGIN PASSWORD VERIFIED:", user.email);
        /* =====================================================
           GENERATE JWT
        ====================================================== */
        const token = generateToken(user._id.toString(), user.role);
        /* =====================================================
           SET COOKIE
        ====================================================== */
        setAuthCookie(res, token);
        console.log("LOGIN COOKIE SET:", user.email);
        /* =====================================================
           RESPONSE
        ====================================================== */
        res.status(200).json({
            success: true,
            message: "Login successful.",
            user: {
                _id: user._id.toString(),
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                kycStatus: user.kycStatus,
            },
        });
    }
    catch (error) {
        console.error("LOGIN ERROR:", error);
        const isDevelopment = process.env.NODE_ENV !==
            "production";
        res.status(500).json({
            success: false,
            message: "Login failed. Please try again.",
            ...(isDevelopment &&
                error instanceof Error
                ? {
                    debug: error.message,
                }
                : {}),
        });
    }
};
exports.loginUser = loginUser;
/* =========================================================
   LOGOUT USER
   POST /api/auth/logout
========================================================= */
const logoutUser = async (_req, res) => {
    try {
        const isProduction = process.env.NODE_ENV ===
            "production";
        res.clearCookie("access_token", {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction
                ? "none"
                : "lax",
            path: "/",
        });
        res.status(200).json({
            success: true,
            message: "Logged out successfully.",
        });
    }
    catch (error) {
        console.error("LOGOUT ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Logout failed.",
        });
    }
};
exports.logoutUser = logoutUser;
