"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unfreezeWallet = exports.freezeWallet = exports.changePassword = exports.regenerateBackupCodes = exports.updateTwoFactorMethod = exports.disableTwoFactor = exports.verifyTwoFactorSetup = exports.startTwoFactorSetup = exports.updateAlertPreferences = exports.getAlertPreferences = exports.runSecurityCheck = exports.getSecurityActivity = exports.logoutOtherSessions = exports.revokeSession = exports.getSessions = exports.getSecurityOverview = void 0;
const crypto_1 = __importDefault(require("crypto"));
const User_js_1 = require("../models/User.js");
const AuthSession_js_1 = require("../models/AuthSession.js");
const SecurityEvent_js_1 = require("../models/SecurityEvent.js");
const SecurityPreferences_js_1 = require("../models/SecurityPreferences.js");
const WalletSecurityLock_js_1 = require("../models/WalletSecurityLock.js");
const crypto_js_1 = require("../utils/crypto.js");
const password_js_1 = require("../utils/password.js");
const securityEventService_js_1 = require("../services/securityEventService.js");
const securityScoreService_js_1 = require("../services/securityScoreService.js");
const securityDeliveryService_js_1 = require("../services/securityDeliveryService.js");
const authSessionService_js_1 = require("../services/authSessionService.js");
const totpService_js_1 = require("../services/totpService.js");
const toStringValue = (value) => {
    if (typeof value === "string") {
        return value;
    }
    if (Array.isArray(value)) {
        const first = value[0];
        return typeof first === "string"
            ? first
            : "";
    }
    return "";
};
const getUserId = (req, res) => {
    const userId = req.user?._id;
    if (!userId) {
        res.status(401).json({
            success: false,
            message: "Not authorized.",
        });
        return null;
    }
    return userId;
};
const ensurePreferences = async (userId) => {
    return SecurityPreferences_js_1.SecurityPreferences.findOneAndUpdate({
        userId,
    }, {
        $setOnInsert: {
            userId,
        },
    }, {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
    });
};
const verifyCurrentPassword = async ({ userId, password, }) => {
    const user = await User_js_1.User.findById(userId).select("+password role authVersion emailEncrypted phoneEncrypted");
    if (!user) {
        return {
            ok: false,
            user: null,
        };
    }
    const storedPassword = user.get("password");
    if (!storedPassword) {
        return {
            ok: false,
            user,
        };
    }
    const matched = await (0, password_js_1.verifyPassword)(storedPassword, password);
    return {
        ok: matched,
        user,
    };
};
const getBackupHashKey = () => {
    const value = process.env.LOOKUP_HMAC_KEY ||
        process.env.JWT_SECRET;
    if (!value) {
        throw new Error("LOOKUP_HMAC_KEY or JWT_SECRET is required for backup codes.");
    }
    return value;
};
const normalizeBackupCode = (value) => {
    return value
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
};
const hashBackupCode = (value) => {
    return crypto_1.default
        .createHmac("sha256", getBackupHashKey())
        .update(normalizeBackupCode(value))
        .digest("hex");
};
const createBackupCodes = () => {
    const rawCodes = Array.from({
        length: 10,
    }, () => {
        const raw = crypto_1.default
            .randomBytes(5)
            .toString("hex")
            .toUpperCase();
        return `${raw.slice(0, 5)}-${raw.slice(5)}`;
    });
    return {
        rawCodes,
        hashes: rawCodes.map(hashBackupCode),
    };
};
const redactMethodTarget = (value) => {
    if (!value) {
        return "Not available";
    }
    if (value.includes("@")) {
        const [name, domain] = value.split("@");
        return `${name?.slice(0, 2) ?? ""}***@${domain ?? ""}`;
    }
    if (value.length > 4) {
        return `***${value.slice(-4)}`;
    }
    return "***";
};
/* =========================================================
   OVERVIEW
   GET /api/security/overview
========================================================= */
const getSecurityOverview = async (req, res) => {
    try {
        const userId = getUserId(req, res);
        if (!userId)
            return;
        const preferences = await ensurePreferences(userId);
        const score = await (0, securityScoreService_js_1.calculateSecurityScore)(userId);
        const delivery = (0, securityDeliveryService_js_1.getTwoFactorDeliveryAvailability)();
        res.status(200).json({
            success: true,
            security: {
                score: score.score,
                riskLevel: score.riskLevel,
                checklist: score.checklist,
                metrics: score.metrics,
                lastSecurityCheckAt: score.lastSecurityCheckAt,
            },
            twoFactor: {
                enabled: preferences.twoFactor.enabled,
                method: preferences.twoFactor.method,
                deliveryAvailability: delivery,
            },
            alerts: preferences.alerts,
        });
    }
    catch (error) {
        console.error("GET SECURITY OVERVIEW ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to load Security Center.",
        });
    }
};
exports.getSecurityOverview = getSecurityOverview;
/* =========================================================
   SESSIONS
========================================================= */
const getSessions = async (req, res) => {
    try {
        const userId = getUserId(req, res);
        if (!userId)
            return;
        const sessions = await AuthSession_js_1.AuthSession.find({
            userId,
            revokedAt: {
                $exists: false,
            },
            expiresAt: {
                $gt: new Date(),
            },
        })
            .sort({
            lastActiveAt: -1,
        })
            .lean();
        res.status(200).json({
            success: true,
            count: sessions.length,
            sessions: sessions.map((session) => ({
                id: session.sessionId,
                device: session.device,
                browser: session.browser,
                os: session.os,
                location: session.location,
                ip: session.maskedIp,
                lastActiveAt: session.lastActiveAt,
                createdAt: session.createdAt,
                expiresAt: session.expiresAt,
                isCurrent: Boolean(req.user
                    ?.sessionId &&
                    req.user
                        .sessionId ===
                        session.sessionId),
            })),
        });
    }
    catch (error) {
        console.error("GET SECURITY SESSIONS ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to load active sessions.",
        });
    }
};
exports.getSessions = getSessions;
const revokeSession = async (req, res) => {
    try {
        const userId = getUserId(req, res);
        if (!userId)
            return;
        const sessionId = toStringValue(req.params.sessionId).trim();
        if (!sessionId) {
            res.status(400).json({
                success: false,
                message: "Session id is required.",
            });
            return;
        }
        if (req.user?.sessionId ===
            sessionId) {
            res.status(400).json({
                success: false,
                message: "Use the normal logout action for the current session.",
            });
            return;
        }
        const revoked = await (0, authSessionService_js_1.revokeSessionById)({
            userId,
            sessionId,
        });
        if (!revoked) {
            res.status(404).json({
                success: false,
                message: "Active session not found.",
            });
            return;
        }
        await (0, securityEventService_js_1.recordSecurityEvent)({
            userId,
            eventType: "SESSION_REVOKED",
            title: "Device session signed out",
            status: "info",
            detail: "A saved device session was revoked from Security Center.",
            sessionId: req.user?.sessionId,
            req,
        });
        res.status(200).json({
            success: true,
            message: "Session signed out successfully.",
        });
    }
    catch (error) {
        console.error("REVOKE SESSION ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to sign out the session.",
        });
    }
};
exports.revokeSession = revokeSession;
const logoutOtherSessions = async (req, res) => {
    try {
        const userId = getUserId(req, res);
        if (!userId)
            return;
        const currentSessionId = req.user?.sessionId;
        if (!currentSessionId) {
            res.status(409).json({
                success: false,
                code: "LEGACY_SESSION",
                message: "Please sign in again before managing individual sessions.",
            });
            return;
        }
        const revokedCount = await (0, authSessionService_js_1.revokeAllOtherSessions)({
            userId,
            currentSessionId,
        });
        await (0, securityEventService_js_1.recordSecurityEvent)({
            userId,
            eventType: "OTHER_SESSIONS_REVOKED",
            title: "Other devices signed out",
            status: "info",
            detail: `${revokedCount} other session(s) were revoked.`,
            sessionId: currentSessionId,
            req,
        });
        res.status(200).json({
            success: true,
            revokedCount,
            message: "Other sessions signed out successfully.",
        });
    }
    catch (error) {
        console.error("LOGOUT OTHER SESSIONS ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to sign out other sessions.",
        });
    }
};
exports.logoutOtherSessions = logoutOtherSessions;
/* =========================================================
   ACTIVITY
========================================================= */
const getSecurityActivity = async (req, res) => {
    try {
        const userId = getUserId(req, res);
        if (!userId)
            return;
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
        const skip = (page - 1) *
            limit;
        const [events, total,] = await Promise.all([
            SecurityEvent_js_1.SecurityEvent.find({
                userId,
            })
                .sort({
                createdAt: -1,
            })
                .skip(skip)
                .limit(limit)
                .lean(),
            SecurityEvent_js_1.SecurityEvent.countDocuments({
                userId,
            }),
        ]);
        res.status(200).json({
            success: true,
            events: events.map((event) => ({
                id: String(event._id),
                type: event.eventType,
                title: event.title,
                status: event.status,
                detail: event.detail ??
                    "",
                device: event.device ??
                    "",
                location: event.location ??
                    "",
                ip: event.maskedIp ??
                    "",
                createdAt: event.createdAt,
            })),
            pagination: {
                page,
                limit,
                total,
                pages: Math.max(1, Math.ceil(total / limit)),
            },
        });
    }
    catch (error) {
        console.error("GET SECURITY ACTIVITY ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to load security activity.",
        });
    }
};
exports.getSecurityActivity = getSecurityActivity;
/* =========================================================
   SECURITY CHECK
========================================================= */
const runSecurityCheck = async (req, res) => {
    try {
        const userId = getUserId(req, res);
        if (!userId)
            return;
        await SecurityPreferences_js_1.SecurityPreferences.findOneAndUpdate({
            userId,
        }, {
            $set: {
                lastSecurityCheckAt: new Date(),
            },
            $inc: {
                securityCheckCount: 1,
            },
            $setOnInsert: {
                userId,
            },
        }, {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
        });
        const result = await (0, securityScoreService_js_1.calculateSecurityScore)(userId);
        await (0, securityEventService_js_1.recordSecurityEvent)({
            userId,
            eventType: "SECURITY_CHECK_RUN",
            title: "Security check completed",
            status: result.riskLevel ===
                "Elevated"
                ? "warning"
                : "success",
            detail: `Security score ${result.score}/100 with ${result.riskLevel.toLowerCase()} risk.`,
            sessionId: req.user?.sessionId,
            req,
        });
        res.status(200).json({
            success: true,
            security: result,
        });
    }
    catch (error) {
        console.error("RUN SECURITY CHECK ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Security check failed.",
        });
    }
};
exports.runSecurityCheck = runSecurityCheck;
/* =========================================================
   ALERT PREFERENCES
========================================================= */
const getAlertPreferences = async (req, res) => {
    try {
        const userId = getUserId(req, res);
        if (!userId)
            return;
        const preferences = await ensurePreferences(userId);
        res.status(200).json({
            success: true,
            alerts: preferences.alerts,
        });
    }
    catch (error) {
        console.error("GET SECURITY ALERTS ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to load alert preferences.",
        });
    }
};
exports.getAlertPreferences = getAlertPreferences;
const updateAlertPreferences = async (req, res) => {
    try {
        const userId = getUserId(req, res);
        if (!userId)
            return;
        const allowed = [
            "newDevice",
            "suspiciousActivity",
            "failedLogin",
        ];
        const updates = {};
        for (const key of allowed) {
            const value = req.body?.[key];
            if (value !== undefined) {
                if (typeof value !==
                    "boolean") {
                    res.status(400).json({
                        success: false,
                        message: `${key} must be boolean.`,
                    });
                    return;
                }
                updates[`alerts.${key}`] = value;
            }
        }
        if (Object.keys(updates)
            .length === 0) {
            res.status(400).json({
                success: false,
                message: "No valid alert preference was provided.",
            });
            return;
        }
        const preferences = await SecurityPreferences_js_1.SecurityPreferences.findOneAndUpdate({
            userId,
        }, {
            $set: updates,
            $setOnInsert: {
                userId,
            },
        }, {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
        });
        await (0, securityEventService_js_1.recordSecurityEvent)({
            userId,
            eventType: "ALERT_PREFERENCES_UPDATED",
            title: "Security alert preferences updated",
            status: "info",
            sessionId: req.user?.sessionId,
            req,
        });
        res.status(200).json({
            success: true,
            message: "Alert preferences updated.",
            alerts: preferences.alerts,
        });
    }
    catch (error) {
        console.error("UPDATE SECURITY ALERTS ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update alert preferences.",
        });
    }
};
exports.updateAlertPreferences = updateAlertPreferences;
/* =========================================================
   2FA SETUP / MANAGEMENT
========================================================= */
const startTwoFactorSetup = async (req, res) => {
    try {
        const userId = getUserId(req, res);
        if (!userId)
            return;
        const password = toStringValue(req.body?.password);
        if (!password) {
            res.status(400).json({
                success: false,
                message: "Current password is required to set up 2FA.",
            });
            return;
        }
        const auth = await verifyCurrentPassword({
            userId,
            password,
        });
        if (!auth.ok ||
            !auth.user) {
            res.status(401).json({
                success: false,
                message: "Current password is incorrect.",
            });
            return;
        }
        const existing = await ensurePreferences(userId);
        if (existing.twoFactor.enabled) {
            res.status(409).json({
                success: false,
                message: "Two-factor authentication is already enabled.",
            });
            return;
        }
        const secret = (0, totpService_js_1.generateTotpSecret)();
        const email = auth.user.emailEncrypted
            ? (0, crypto_js_1.decryptData)(auth.user.emailEncrypted)
            : auth.user._id.toString();
        existing.twoFactor.pendingSecretEncrypted =
            (0, crypto_js_1.encryptData)(secret);
        existing.twoFactor.method =
            "app";
        await existing.save();
        await (0, securityEventService_js_1.recordSecurityEvent)({
            userId,
            eventType: "TWO_FACTOR_SETUP_STARTED",
            title: "Two-factor setup started",
            status: "info",
            sessionId: req.user?.sessionId,
            req,
        });
        res.status(200).json({
            success: true,
            setup: {
                method: "app",
                secret,
                otpauthUri: (0, totpService_js_1.buildOtpAuthUri)({
                    secret,
                    accountLabel: email,
                }),
            },
            message: "Scan the otpauth URI with an authenticator app, then verify a code.",
        });
    }
    catch (error) {
        console.error("START 2FA SETUP ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to start 2FA setup.",
        });
    }
};
exports.startTwoFactorSetup = startTwoFactorSetup;
const verifyTwoFactorSetup = async (req, res) => {
    try {
        const userId = getUserId(req, res);
        if (!userId)
            return;
        const code = toStringValue(req.body?.code).trim();
        if (!code) {
            res.status(400).json({
                success: false,
                message: "Authenticator code is required.",
            });
            return;
        }
        const preferences = await SecurityPreferences_js_1.SecurityPreferences.findOne({
            userId,
        }).select("+twoFactor.backupCodeHashes");
        const pending = preferences?.twoFactor
            ?.pendingSecretEncrypted;
        if (!preferences ||
            !pending) {
            res.status(409).json({
                success: false,
                message: "No pending 2FA setup was found.",
            });
            return;
        }
        const secret = (0, crypto_js_1.decryptData)(pending);
        if (!(0, totpService_js_1.verifyTotp)(secret, code)) {
            res.status(400).json({
                success: false,
                message: "Invalid authenticator code.",
            });
            return;
        }
        const backup = createBackupCodes();
        preferences.twoFactor.secretEncrypted =
            pending;
        preferences.twoFactor.pendingSecretEncrypted =
            undefined;
        preferences.twoFactor.enabled =
            true;
        preferences.twoFactor.method =
            "app";
        preferences.twoFactor.enabledAt =
            new Date();
        preferences.twoFactor.backupCodeHashes =
            backup.hashes;
        await preferences.save();
        await (0, securityEventService_js_1.recordSecurityEvent)({
            userId,
            eventType: "TWO_FACTOR_ENABLED",
            title: "Two-factor authentication enabled",
            status: "success",
            sessionId: req.user?.sessionId,
            req,
        });
        res.status(200).json({
            success: true,
            message: "Two-factor authentication enabled.",
            backupCodes: backup.rawCodes,
            warning: "These backup codes are shown once. Store them somewhere safe.",
        });
    }
    catch (error) {
        console.error("VERIFY 2FA SETUP ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to verify 2FA setup.",
        });
    }
};
exports.verifyTwoFactorSetup = verifyTwoFactorSetup;
const disableTwoFactor = async (req, res) => {
    try {
        const userId = getUserId(req, res);
        if (!userId)
            return;
        const password = toStringValue(req.body?.password);
        const auth = await verifyCurrentPassword({
            userId,
            password,
        });
        if (!password ||
            !auth.ok) {
            res.status(401).json({
                success: false,
                message: "Current password is required and must be correct.",
            });
            return;
        }
        const preferences = await SecurityPreferences_js_1.SecurityPreferences.findOne({
            userId,
        }).select("+twoFactor.backupCodeHashes");
        if (!preferences?.twoFactor
            .enabled) {
            res.status(409).json({
                success: false,
                message: "Two-factor authentication is not enabled.",
            });
            return;
        }
        preferences.twoFactor.enabled =
            false;
        preferences.twoFactor.method =
            "app";
        preferences.twoFactor.secretEncrypted =
            undefined;
        preferences.twoFactor.pendingSecretEncrypted =
            undefined;
        preferences.twoFactor.backupCodeHashes =
            [];
        preferences.twoFactor.enabledAt =
            undefined;
        await preferences.save();
        await (0, securityEventService_js_1.recordSecurityEvent)({
            userId,
            eventType: "TWO_FACTOR_DISABLED",
            title: "Two-factor authentication disabled",
            status: "warning",
            sessionId: req.user?.sessionId,
            req,
        });
        res.status(200).json({
            success: true,
            message: "Two-factor authentication disabled.",
        });
    }
    catch (error) {
        console.error("DISABLE 2FA ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to disable 2FA.",
        });
    }
};
exports.disableTwoFactor = disableTwoFactor;
const updateTwoFactorMethod = async (req, res) => {
    try {
        const userId = getUserId(req, res);
        if (!userId)
            return;
        const method = toStringValue(req.body?.method);
        const password = toStringValue(req.body?.password);
        if (![
            "app",
            "email",
            "sms",
        ].includes(method)) {
            res.status(400).json({
                success: false,
                message: "Invalid 2FA method.",
            });
            return;
        }
        const auth = await verifyCurrentPassword({
            userId,
            password,
        });
        if (!password ||
            !auth.ok ||
            !auth.user) {
            res.status(401).json({
                success: false,
                message: "Current password is required and must be correct.",
            });
            return;
        }
        const preferences = await ensurePreferences(userId);
        if (!preferences.twoFactor
            .enabled) {
            res.status(409).json({
                success: false,
                message: "Enable 2FA before changing its primary method.",
            });
            return;
        }
        const delivery = (0, securityDeliveryService_js_1.getTwoFactorDeliveryAvailability)();
        if (method === "email" &&
            !delivery.email) {
            res.status(503).json({
                success: false,
                code: "EMAIL_2FA_NOT_CONFIGURED",
                message: "Email 2FA provider is not configured on the backend.",
            });
            return;
        }
        if (method === "sms" &&
            !delivery.sms) {
            res.status(503).json({
                success: false,
                code: "SMS_2FA_NOT_CONFIGURED",
                message: "SMS 2FA provider is not configured on the backend.",
            });
            return;
        }
        if (method === "app" &&
            !preferences.twoFactor
                .secretEncrypted) {
            res.status(409).json({
                success: false,
                message: "Authenticator setup is incomplete.",
            });
            return;
        }
        let target = "";
        if (method === "email" &&
            auth.user.emailEncrypted) {
            target = (0, crypto_js_1.decryptData)(auth.user.emailEncrypted);
        }
        if (method === "sms" &&
            auth.user.phoneEncrypted) {
            target = (0, crypto_js_1.decryptData)(auth.user.phoneEncrypted);
        }
        if (method !== "app" &&
            !target) {
            res.status(409).json({
                success: false,
                message: method === "email"
                    ? "No verified email is available for email 2FA."
                    : "No phone number is available for SMS 2FA.",
            });
            return;
        }
        preferences.twoFactor.method =
            method;
        await preferences.save();
        await (0, securityEventService_js_1.recordSecurityEvent)({
            userId,
            eventType: "TWO_FACTOR_METHOD_CHANGED",
            title: "Two-factor method changed",
            status: "info",
            detail: `Primary method changed to ${method}.`,
            sessionId: req.user?.sessionId,
            req,
        });
        res.status(200).json({
            success: true,
            method,
            target: method === "app"
                ? "Authenticator app"
                : redactMethodTarget(target),
            message: "Primary 2FA method updated.",
        });
    }
    catch (error) {
        console.error("UPDATE 2FA METHOD ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update the 2FA method.",
        });
    }
};
exports.updateTwoFactorMethod = updateTwoFactorMethod;
const regenerateBackupCodes = async (req, res) => {
    try {
        const userId = getUserId(req, res);
        if (!userId)
            return;
        const password = toStringValue(req.body?.password);
        const auth = await verifyCurrentPassword({
            userId,
            password,
        });
        if (!password ||
            !auth.ok) {
            res.status(401).json({
                success: false,
                message: "Current password is required and must be correct.",
            });
            return;
        }
        const preferences = await SecurityPreferences_js_1.SecurityPreferences.findOne({
            userId,
        }).select("+twoFactor.backupCodeHashes");
        if (!preferences?.twoFactor
            .enabled) {
            res.status(409).json({
                success: false,
                message: "Enable 2FA before generating backup codes.",
            });
            return;
        }
        const backup = createBackupCodes();
        preferences.twoFactor.backupCodeHashes =
            backup.hashes;
        await preferences.save();
        await (0, securityEventService_js_1.recordSecurityEvent)({
            userId,
            eventType: "BACKUP_CODES_REGENERATED",
            title: "2FA backup codes regenerated",
            status: "info",
            sessionId: req.user?.sessionId,
            req,
        });
        res.status(200).json({
            success: true,
            backupCodes: backup.rawCodes,
            warning: "Old backup codes no longer work. New codes are shown only once.",
        });
    }
    catch (error) {
        console.error("REGENERATE BACKUP CODES ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to regenerate backup codes.",
        });
    }
};
exports.regenerateBackupCodes = regenerateBackupCodes;
/* =========================================================
   CHANGE PASSWORD
========================================================= */
const changePassword = async (req, res) => {
    try {
        const userId = getUserId(req, res);
        if (!userId)
            return;
        const currentPassword = toStringValue(req.body?.currentPassword);
        const newPassword = toStringValue(req.body?.newPassword);
        if (!currentPassword ||
            !newPassword) {
            res.status(400).json({
                success: false,
                message: "Current password and new password are required.",
            });
            return;
        }
        const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/;
        if (!strongPassword.test(newPassword)) {
            res.status(400).json({
                success: false,
                code: "WEAK_PASSWORD",
                message: "New password must be 8-128 characters and include uppercase, lowercase and a number.",
            });
            return;
        }
        const auth = await verifyCurrentPassword({
            userId,
            password: currentPassword,
        });
        if (!auth.ok ||
            !auth.user) {
            res.status(401).json({
                success: false,
                message: "Current password is incorrect.",
            });
            return;
        }
        const storedPassword = auth.user.get("password");
        const samePassword = await (0, password_js_1.verifyPassword)(storedPassword, newPassword);
        if (samePassword) {
            res.status(400).json({
                success: false,
                message: "New password must be different from the current password.",
            });
            return;
        }
        auth.user.password =
            await (0, password_js_1.hashPassword)(newPassword);
        auth.user.authVersion =
            (auth.user.authVersion ??
                0) + 1;
        auth.user.passwordPolicyVersion =
            2;
        auth.user.passwordChangedAt =
            new Date();
        await auth.user.save();
        await (0, authSessionService_js_1.revokeAllSessions)(userId);
        const session = await (0, authSessionService_js_1.issueAuthenticatedSession)({
            user: auth.user,
            req,
            res,
        });
        await (0, securityEventService_js_1.recordSecurityEvent)({
            userId,
            eventType: "PASSWORD_CHANGED",
            title: "Password changed",
            status: "success",
            detail: "All previous sessions were revoked after the password change.",
            sessionId: session.sessionId,
            req,
        });
        res.status(200).json({
            success: true,
            message: "Password changed successfully. Other sessions were signed out.",
        });
    }
    catch (error) {
        console.error("CHANGE SECURITY PASSWORD ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to change password.",
        });
    }
};
exports.changePassword = changePassword;
/* =========================================================
   WALLET FREEZE / UNFREEZE
========================================================= */
const freezeWallet = async (req, res) => {
    try {
        const userId = getUserId(req, res);
        if (!userId)
            return;
        const password = toStringValue(req.body?.password);
        const auth = await verifyCurrentPassword({
            userId,
            password,
        });
        if (!password ||
            !auth.ok) {
            res.status(401).json({
                success: false,
                message: "Current password is required to freeze the wallet.",
            });
            return;
        }
        const lock = await WalletSecurityLock_js_1.WalletSecurityLock.findOneAndUpdate({
            userId,
        }, {
            $set: {
                frozen: true,
                reason: "USER_SECURITY_FREEZE",
                frozenAt: new Date(),
                updatedBySessionId: req.user
                    ?.sessionId,
            },
            $unset: {
                unfrozenAt: 1,
            },
            $setOnInsert: {
                userId,
            },
        }, {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
        });
        await (0, securityEventService_js_1.recordSecurityEvent)({
            userId,
            eventType: "WALLET_FROZEN",
            title: "Wallet security freeze enabled",
            status: "warning",
            detail: "Outbound wallet actions are blocked until the security freeze is removed.",
            sessionId: req.user?.sessionId,
            req,
        });
        res.status(200).json({
            success: true,
            wallet: {
                frozen: lock.frozen,
                frozenAt: lock.frozenAt,
            },
            message: "Wallet frozen successfully.",
        });
    }
    catch (error) {
        console.error("FREEZE WALLET ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to freeze wallet.",
        });
    }
};
exports.freezeWallet = freezeWallet;
const unfreezeWallet = async (req, res) => {
    try {
        const userId = getUserId(req, res);
        if (!userId)
            return;
        const password = toStringValue(req.body?.password);
        const auth = await verifyCurrentPassword({
            userId,
            password,
        });
        if (!password ||
            !auth.ok) {
            res.status(401).json({
                success: false,
                message: "Current password is required to unfreeze the wallet.",
            });
            return;
        }
        const lock = await WalletSecurityLock_js_1.WalletSecurityLock.findOne({
            userId,
        });
        if (!lock?.frozen) {
            res.status(409).json({
                success: false,
                message: "Wallet is not currently frozen.",
            });
            return;
        }
        lock.frozen = false;
        lock.unfrozenAt =
            new Date();
        lock.updatedBySessionId =
            req.user?.sessionId;
        await lock.save();
        await (0, securityEventService_js_1.recordSecurityEvent)({
            userId,
            eventType: "WALLET_UNFROZEN",
            title: "Wallet security freeze removed",
            status: "success",
            sessionId: req.user?.sessionId,
            req,
        });
        res.status(200).json({
            success: true,
            wallet: {
                frozen: false,
                unfrozenAt: lock.unfrozenAt,
            },
            message: "Wallet unfrozen successfully.",
        });
    }
    catch (error) {
        console.error("UNFREEZE WALLET ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to unfreeze wallet.",
        });
    }
};
exports.unfreezeWallet = unfreezeWallet;
