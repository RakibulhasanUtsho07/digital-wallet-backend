"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminOnly = void 0;
const adminOnly = (req, res, next) => {
    if (!req.user) {
        res.status(401).json({
            success: false,
            message: "Authentication required.",
        });
        return;
    }
    if (req.user.role !== "admin") {
        res.status(403).json({
            success: false,
            message: "Access denied. Admin resources only.",
        });
        return;
    }
    next();
};
exports.adminOnly = adminOnly;
