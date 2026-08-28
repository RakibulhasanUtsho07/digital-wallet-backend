"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = exports.notFound = void 0;
// Not Found Error Handler (যখন কোনো ভুল URL-এ রিকোয়েস্ট আসবে)
const notFound = (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    res.status(404);
    next(error);
};
exports.notFound = notFound;
// গ্লোবাল Error Handler (পুরো অ্যাপ্লিকেশনের যেকোনো এরর এখানে এসে ধরা পড়বে)
const errorHandler = (err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode).json({
        success: false,
        message: err.message || "Internal Server Error",
        // প্রোডাকশনে আমরা stack trace লুকাবো সিকিউরিটির জন্য
        stack: process.env.NODE_ENV === "production" ? null : err.stack,
    });
};
exports.errorHandler = errorHandler;
