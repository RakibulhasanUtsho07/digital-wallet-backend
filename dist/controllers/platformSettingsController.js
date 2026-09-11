"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPlatformSettings = exports.verifyPlatformSettingsAudit = exports.getPlatformSettingsAudit = exports.updatePlatformSettings = exports.getPlatformSettings = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const User_js_1 = require("../models/User.js");
const PlatformSettingsAudit_js_1 = require("../models/PlatformSettingsAudit.js");
const platformSettingsService_js_1 = require("../services/platformSettingsService.js");
const platformSettingsAuditService_js_1 = require("../services/platformSettingsAuditService.js");
const platformSettingsValidation_js_1 = require("../services/platformSettingsValidation.js");
const password_js_1 = require("../utils/password.js");
const toStringValue = (value) => {
    return (typeof value ===
        "string"
        ? value
        : "");
};
const verifyAdminPassword = async (userId, password) => {
    if (!password ||
        password.length >
            1024) {
        return false;
    }
    const user = await User_js_1.User.findById(userId).select("+password role accountStatus");
    if (!user ||
        user.role !==
            "admin") {
        return false;
    }
    if (user.get("accountStatus") ===
        "deleted") {
        return false;
    }
    const hash = user.get("password");
    if (!hash) {
        return false;
    }
    return (0, password_js_1.verifyPassword)(hash, password);
};
const calculateConfigurationHealth = (settings) => {
    let score = 48;
    if (settings.security
        .requireMfa) {
        score += 14;
    }
    if (settings.security
        .requireReauthForSensitiveActions) {
        score += 12;
    }
    if (settings.risk
        .requireKycForHighValue) {
        score += 8;
    }
    if (settings.security
        .maxLoginAttempts <=
        5) {
        score += 6;
    }
    if (settings.security
        .sessionTimeoutMins <=
        60) {
        score += 5;
    }
    if (settings.risk
        .maxTransfersPerWindow <=
        10) {
        score += 4;
    }
    if (process.env
        .AUDIT_HMAC_KEY) {
        score += 3;
    }
    return Math.min(score, 100);
};
const calculateRiskIndex = (settings) => {
    const thresholdRatio = settings.risk
        .reviewThreshold /
        Math.max(settings.risk
            .dailyTransferLimit, 1);
    const velocityRisk = settings.risk
        .maxTransfersPerWindow >
        10
        ? 22
        : settings.risk
            .maxTransfersPerWindow >
            7
            ? 12
            : 6;
    const base = Math.round(thresholdRatio *
        55) +
        velocityRisk +
        (settings.risk
            .requireKycForHighValue
            ? 5
            : 20);
    return Math.min(Math.max(base, 10), 95);
};
const formatRelativeTime = (date) => {
    const seconds = Math.max(Math.floor((Date.now() -
        date.getTime()) /
        1000), 0);
    if (seconds < 60) {
        return "Just now";
    }
    const minutes = Math.floor(seconds /
        60);
    if (minutes < 60) {
        return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
    }
    const hours = Math.floor(minutes /
        60);
    if (hours < 24) {
        return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    }
    const days = Math.floor(hours /
        24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
};
const auditToDTO = (item) => {
    const action = item.action ===
        "SETTINGS_RESET"
        ? "Platform settings reset"
        : "Platform configuration updated";
    const sections = item.changedSections ||
        [];
    return {
        id: String(item._id),
        actor: "Platform Admin",
        action,
        detail: sections.length >
            0
            ? `Changed ${sections.join(", ")} configuration.`
            : "Platform configuration changed.",
        time: formatRelativeTime(new Date(item.occurredAt)),
        severity: item.severity,
        /*
         * Never expose raw network identifiers.
         */
        ip: item.sourceIpHash
            ? `Protected • ${item.sourceIpHash.slice(-8)}`
            : "Protected",
        revision: item.revision,
        changedFields: item.changedFields ||
            [],
    };
};
const getOverview = async (settings) => {
    const [activeUsers, adminUsers, pendingKyc,] = await Promise.all([
        User_js_1.User.countDocuments({
            role: "user",
            accountStatus: {
                $ne: "deleted",
            },
        }),
        User_js_1.User.countDocuments({
            role: "admin",
            accountStatus: {
                $ne: "deleted",
            },
        }),
        User_js_1.User.countDocuments({
            kycStatus: "pending",
            accountStatus: {
                $ne: "deleted",
            },
        }),
    ]);
    return {
        activeUsers,
        adminUsers,
        pendingKyc,
        systemStatus: settings.platform
            .maintenanceMode
            ? "maintenance"
            : "operational",
        configurationHealth: calculateConfigurationHealth(settings),
        riskIndex: calculateRiskIndex(settings),
        services: {
            database: "healthy",
            api: "healthy",
            auth: process.env
                .JWT_SECRET &&
                process.env
                    .AUDIT_HMAC_KEY
                ? "configured"
                : "review",
        },
    };
};
const getPlatformSettings = async (_req, res) => {
    try {
        const settings = await (0, platformSettingsService_js_1.getOrCreatePlatformSettings)();
        const dto = (0, platformSettingsService_js_1.settingsToDTO)(settings);
        const [overview, recentAudit,] = await Promise.all([
            getOverview(dto),
            PlatformSettingsAudit_js_1.PlatformSettingsAudit.find()
                .sort({
                revision: -1,
            })
                .limit(20)
                .lean(),
        ]);
        res.status(200).json({
            success: true,
            settings: dto,
            overview,
            auditItems: recentAudit.map(auditToDTO),
            meta: {
                revision: settings.revision,
                updatedAt: settings.updatedAt,
            },
        });
    }
    catch (error) {
        console.error("GET PLATFORM SETTINGS ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to load platform settings.",
        });
    }
};
exports.getPlatformSettings = getPlatformSettings;
const updatePlatformSettings = async (req, res) => {
    const userId = req.user?._id;
    if (!userId) {
        res.status(401).json({
            success: false,
            message: "Not authorized.",
        });
        return;
    }
    const password = toStringValue(req.body
        ?.password);
    if (!password) {
        res.status(400).json({
            success: false,
            message: "Current admin password is required.",
        });
        return;
    }
    try {
        const validPassword = await verifyAdminPassword(userId, password);
        if (!validPassword) {
            res.status(401).json({
                success: false,
                message: "Current admin password is incorrect.",
            });
            return;
        }
        const validation = (0, platformSettingsValidation_js_1.validatePlatformSettings)(req.body
            ?.settings);
        if (!validation.ok) {
            res.status(400).json({
                success: false,
                message: validation.message,
            });
            return;
        }
        const session = await mongoose_1.default.startSession();
        let result;
        try {
            await session.withTransaction(async () => {
                const current = await (0, platformSettingsService_js_1.getOrCreatePlatformSettings)(session);
                const before = (0, platformSettingsService_js_1.settingsToDTO)(current);
                const after = validation.settings;
                const changes = (0, platformSettingsAuditService_js_1.getChangedFields)(before, after);
                if (changes.fields
                    .length === 0) {
                    result = {
                        settings: before,
                        revision: current.revision,
                        updatedAt: current.updatedAt,
                        noChange: true,
                    };
                    return;
                }
                const updated = await (0, platformSettingsService_js_1.updateSettingsAtomically)({
                    currentRevision: current.revision,
                    nextSettings: after,
                    userId,
                    session,
                });
                if (!updated) {
                    throw new Error("PLATFORM_SETTINGS_CONFLICT");
                }
                const updatedDto = (0, platformSettingsService_js_1.settingsToDTO)(updated);
                await (0, platformSettingsAuditService_js_1.appendSettingsAudit)({
                    req,
                    action: "SETTINGS_UPDATED",
                    severity: (0, platformSettingsAuditService_js_1.determineAuditSeverity)(changes.fields),
                    revision: updated.revision,
                    before,
                    after: updatedDto,
                    changedSections: changes.sections,
                    changedFields: changes.fields,
                    session,
                });
                result = {
                    settings: updatedDto,
                    revision: updated.revision,
                    updatedAt: updated.updatedAt,
                    noChange: false,
                };
            });
        }
        finally {
            await session.endSession();
        }
        if (!result) {
            throw new Error("Platform settings transaction did not return a result.");
        }
        res.status(200).json({
            success: true,
            message: result.noChange
                ? "No platform setting changes were detected."
                : "Platform settings updated successfully.",
            settings: result.settings,
            meta: {
                revision: result.revision,
                updatedAt: result.updatedAt,
            },
        });
    }
    catch (error) {
        if (error instanceof
            Error &&
            (error.message ===
                "PLATFORM_SETTINGS_CONFLICT" ||
                error.message.includes("WriteConflict"))) {
            res.status(409).json({
                success: false,
                code: "SETTINGS_CONFLICT",
                message: "Platform settings changed during this request. Reload the latest configuration and try again.",
            });
            return;
        }
        console.error("UPDATE PLATFORM SETTINGS ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update platform settings.",
        });
    }
};
exports.updatePlatformSettings = updatePlatformSettings;
const getPlatformSettingsAudit = async (req, res) => {
    try {
        const severityRaw = toStringValue(req.query
            .severity);
        const page = Math.max(Number(req.query
            .page) ||
            1, 1);
        const limit = Math.min(Math.max(Number(req.query
            .limit) ||
            25, 1), 100);
        const filter = {};
        if (severityRaw ===
            "normal" ||
            severityRaw ===
                "warning" ||
            severityRaw ===
                "critical") {
            filter.severity =
                severityRaw;
        }
        const [total, records,] = await Promise.all([
            PlatformSettingsAudit_js_1.PlatformSettingsAudit.countDocuments(filter),
            PlatformSettingsAudit_js_1.PlatformSettingsAudit.find(filter)
                .sort({
                revision: -1,
            })
                .skip((page -
                1) *
                limit)
                .limit(limit)
                .lean(),
        ]);
        res.status(200).json({
            success: true,
            count: records.length,
            total,
            page,
            pages: Math.max(Math.ceil(total /
                limit), 1),
            auditItems: records.map(auditToDTO),
        });
    }
    catch (error) {
        console.error("GET PLATFORM SETTINGS AUDIT ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to load platform settings audit.",
        });
    }
};
exports.getPlatformSettingsAudit = getPlatformSettingsAudit;
const verifyPlatformSettingsAudit = async (_req, res) => {
    try {
        const verification = await (0, platformSettingsAuditService_js_1.verifyAuditChain)();
        res.status(verification.valid
            ? 200
            : 409).json({
            success: verification.valid,
            audit: verification,
        });
    }
    catch (error) {
        console.error("VERIFY PLATFORM AUDIT ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Unable to verify platform audit integrity.",
        });
    }
};
exports.verifyPlatformSettingsAudit = verifyPlatformSettingsAudit;
const resetPlatformSettings = async (req, res) => {
    const userId = req.user?._id;
    if (!userId) {
        res.status(401).json({
            success: false,
            message: "Not authorized.",
        });
        return;
    }
    const password = toStringValue(req.body
        ?.password);
    const confirmation = toStringValue(req.body
        ?.confirmation)
        .trim()
        .toUpperCase();
    if (confirmation !==
        "RESET") {
        res.status(400).json({
            success: false,
            message: 'Type "RESET" to confirm platform settings reset.',
        });
        return;
    }
    try {
        const validPassword = await verifyAdminPassword(userId, password);
        if (!validPassword) {
            res.status(401).json({
                success: false,
                message: "Current admin password is incorrect.",
            });
            return;
        }
        const session = await mongoose_1.default.startSession();
        let result;
        try {
            await session.withTransaction(async () => {
                const current = await (0, platformSettingsService_js_1.getOrCreatePlatformSettings)(session);
                const before = (0, platformSettingsService_js_1.settingsToDTO)(current);
                const after = platformSettingsService_js_1.PLATFORM_DEFAULTS;
                const changes = (0, platformSettingsAuditService_js_1.getChangedFields)(before, after);
                if (changes.fields
                    .length === 0) {
                    result = {
                        settings: before,
                        revision: current.revision,
                        updatedAt: current.updatedAt,
                        noChange: true,
                    };
                    return;
                }
                const updated = await (0, platformSettingsService_js_1.updateSettingsAtomically)({
                    currentRevision: current.revision,
                    nextSettings: after,
                    userId,
                    session,
                });
                if (!updated) {
                    throw new Error("PLATFORM_SETTINGS_CONFLICT");
                }
                const updatedDto = (0, platformSettingsService_js_1.settingsToDTO)(updated);
                await (0, platformSettingsAuditService_js_1.appendSettingsAudit)({
                    req,
                    action: "SETTINGS_RESET",
                    severity: "critical",
                    revision: updated.revision,
                    before,
                    after: updatedDto,
                    changedSections: changes.sections,
                    changedFields: changes.fields,
                    session,
                });
                result = {
                    settings: updatedDto,
                    revision: updated.revision,
                    updatedAt: updated.updatedAt,
                    noChange: false,
                };
            });
        }
        finally {
            await session.endSession();
        }
        if (!result) {
            throw new Error("Platform settings reset transaction returned no result.");
        }
        res.status(200).json({
            success: true,
            message: result.noChange
                ? "Platform settings already match backend defaults."
                : "Platform settings reset successfully.",
            settings: result.settings,
            meta: {
                revision: result.revision,
                updatedAt: result.updatedAt,
            },
        });
    }
    catch (error) {
        if (error instanceof
            Error &&
            (error.message ===
                "PLATFORM_SETTINGS_CONFLICT" ||
                error.message.includes("WriteConflict"))) {
            res.status(409).json({
                success: false,
                code: "SETTINGS_CONFLICT",
                message: "Platform settings changed during reset. Reload and try again.",
            });
            return;
        }
        console.error("RESET PLATFORM SETTINGS ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to reset platform settings.",
        });
    }
};
exports.resetPlatformSettings = resetPlatformSettings;
