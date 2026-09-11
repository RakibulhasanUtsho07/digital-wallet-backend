"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = void 0;
/* =========================================================
   REQUIRE ADMIN
========================================================= */
/*
 * IMPORTANT:
 * This middleware must run AFTER protect.
 *
 * Correct:
 *
 * router.get(
 *   "/...",
 *   protect,
 *   requireAdmin,
 *   controller
 * );
 */
const requireAdmin = (req, res, next) => {
    /* =====================================================
       AUTHENTICATED USER REQUIRED
    ====================================================== */
    if (!req.user?._id) {
        res.status(401).json({
            success: false,
            message: "Not authorized.",
        });
        return;
    }
    /* =====================================================
       ADMIN ROLE REQUIRED
    ====================================================== */
    if (req.user.role !==
        "admin") {
        res.status(403).json({
            success: false,
            message: "Administrator access is required.",
        });
        return;
    }
    /* =====================================================
       CONTINUE
    ====================================================== */
    next();
};
exports.requireAdmin = requireAdmin;
