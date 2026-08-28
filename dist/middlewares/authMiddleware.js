"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.protect = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_js_1 = require("../models/User.js");
// Request-এর বদলে AuthRequest ব্যবহার করুন
const protect = async (req, res, next) => {
    // Accept either an Authorization: Bearer header (useful for non-browser
    // clients — Postman, mobile apps, etc.) OR the HttpOnly `access_token`
    // cookie that the backend actually sets on login/register. The web app
    // only ever has the cookie: it's HttpOnly on purpose, so frontend JS
    // can never read it to build a Bearer header itself. Without this
    // `req.cookies` fallback, every request from the web app fell straight
    // into the "no token provided" 401 below — even immediately after a
    // successful login — which is why login looked like it "wasn't working"
    // with no visible error.
    let token;
    if (req.headers.authorization?.startsWith("Bearer")) {
        token = req.headers.authorization.split(" ")[1];
    }
    else if (req.cookies?.access_token) {
        token = req.cookies.access_token;
    }
    if (!token) {
        res.status(401).json({ message: "Not authorized, no token provided" });
        return;
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        const foundUser = await User_js_1.User.findById(decoded.id).select("-password");
        if (!foundUser) {
            res.status(401).json({ message: "User not found" });
            return;
        }
        // এখন আর এরর দেবে না
        req.user = {
            _id: foundUser._id.toString(),
            role: foundUser.role,
        };
        next();
    }
    catch (error) {
        res.status(401).json({ message: "Not authorized, token failed" });
    }
};
exports.protect = protect;
