"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blockUserMutationsDuringMaintenance = exports.requireSignupsOpen = void 0;
const platformSettingsService_js_1 = require("../services/platformSettingsService.js");
/*
 * Put this before registerUser:
 *
 * router.post(
 *   "/register",
 *   requireSignupsOpen,
 *   registerUser
 * );
 */
const requireSignupsOpen = async (_req, res, next) => {
    try {
        const settings = await (0, platformSettingsService_js_1.getOrCreatePlatformSettings)();
        if (settings.platform
            .maintenanceMode) {
            res.status(503).json({
                success: false,
                message: "Registration is temporarily unavailable during maintenance.",
            });
            return;
        }
        if (!settings.platform
            .allowSignups) {
            res.status(403).json({
                success: false,
                message: "New account registration is currently disabled.",
            });
            return;
        }
        next();
    }
    catch (error) {
        console.error("SIGNUP POLICY CHECK ERROR:", error);
        /*
         * Fail closed for security-sensitive platform policy.
         */
        res.status(503).json({
            success: false,
            message: "Unable to verify registration policy.",
        });
    }
};
exports.requireSignupsOpen = requireSignupsOpen;
/*
 * Use AFTER protect on routes that mutate wallet/platform data.
 * Admins are allowed through so they can recover the platform.
 */
const blockUserMutationsDuringMaintenance = async (req, res, next) => {
    if ([
        "GET",
        "HEAD",
        "OPTIONS",
    ].includes(req.method)) {
        next();
        return;
    }
    if (req.user?.role ===
        "admin") {
        next();
        return;
    }
    try {
        const settings = await (0, platformSettingsService_js_1.getOrCreatePlatformSettings)();
        if (settings.platform
            .maintenanceMode) {
            res.status(503).json({
                success: false,
                code: "PLATFORM_MAINTENANCE",
                message: "Wallet operations are temporarily unavailable during maintenance.",
            });
            return;
        }
        next();
    }
    catch (error) {
        console.error("MAINTENANCE POLICY CHECK ERROR:", error);
        res.status(503).json({
            success: false,
            message: "Unable to verify platform availability.",
        });
    }
};
exports.blockUserMutationsDuringMaintenance = blockUserMutationsDuringMaintenance;
