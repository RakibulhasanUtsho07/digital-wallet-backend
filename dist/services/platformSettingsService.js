"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSettingsAtomically = exports.settingsToDTO = exports.getOrCreatePlatformSettings = exports.PLATFORM_DEFAULTS = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const PlatformSettings_js_1 = require("../models/PlatformSettings.js");
/* =========================================================
   PLATFORM DEFAULTS
========================================================= */
exports.PLATFORM_DEFAULTS = {
    platform: {
        maintenanceMode: false,
        allowSignups: true,
        defaultCurrency: "BDT",
    },
    risk: {
        dailyTransferLimit: 50000,
        reviewThreshold: 25000,
        requireKycForHighValue: true,
        velocityWindowMinutes: 30,
        maxTransfersPerWindow: 8,
    },
    security: {
        requireMfa: true,
        sessionTimeoutMins: 30,
        maxLoginAttempts: 5,
        requireReauthForSensitiveActions: true,
    },
};
/* =========================================================
   GET OR CREATE SINGLETON SETTINGS
========================================================= */
const getOrCreatePlatformSettings = async (session) => {
    const query = PlatformSettings_js_1.PlatformSettings.findOne({
        key: "global",
    });
    if (session) {
        query.session(session);
    }
    const existing = await query;
    if (existing) {
        return existing;
    }
    try {
        const created = await PlatformSettings_js_1.PlatformSettings.create([
            {
                key: "global",
                ...exports.PLATFORM_DEFAULTS,
            },
        ], session
            ? {
                session,
            }
            : undefined);
        const settings = created[0];
        if (!settings) {
            throw new Error("Failed to create platform settings.");
        }
        return settings;
    }
    catch (error) {
        /*
         * If two first requests race to create the
         * singleton document, one can get duplicate-key.
         * Read the winner instead of failing.
         */
        if (typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === 11000) {
            const retry = PlatformSettings_js_1.PlatformSettings.findOne({
                key: "global",
            });
            if (session) {
                retry.session(session);
            }
            const created = await retry;
            if (created) {
                return created;
            }
        }
        throw error;
    }
};
exports.getOrCreatePlatformSettings = getOrCreatePlatformSettings;
/* =========================================================
   SAFE DTO
========================================================= */
const settingsToDTO = (settings) => {
    return {
        platform: {
            maintenanceMode: settings.platform
                .maintenanceMode,
            allowSignups: settings.platform
                .allowSignups,
            defaultCurrency: settings.platform
                .defaultCurrency,
        },
        risk: {
            dailyTransferLimit: settings.risk
                .dailyTransferLimit,
            reviewThreshold: settings.risk
                .reviewThreshold,
            requireKycForHighValue: settings.risk
                .requireKycForHighValue,
            velocityWindowMinutes: settings.risk
                .velocityWindowMinutes,
            maxTransfersPerWindow: settings.risk
                .maxTransfersPerWindow,
        },
        security: {
            requireMfa: settings.security
                .requireMfa,
            sessionTimeoutMins: settings.security
                .sessionTimeoutMins,
            maxLoginAttempts: settings.security
                .maxLoginAttempts,
            requireReauthForSensitiveActions: settings.security
                .requireReauthForSensitiveActions,
        },
    };
};
exports.settingsToDTO = settingsToDTO;
/* =========================================================
   ATOMIC SETTINGS UPDATE
========================================================= */
const updateSettingsAtomically = async ({ currentRevision, nextSettings, userId, session, }) => {
    /*
     * revision in the query gives optimistic concurrency.
     * If another admin already changed the configuration,
     * this update returns null instead of overwriting it.
     */
    return PlatformSettings_js_1.PlatformSettings.findOneAndUpdate({
        key: "global",
        revision: currentRevision,
    }, {
        $set: {
            platform: nextSettings.platform,
            risk: nextSettings.risk,
            security: nextSettings.security,
            updatedBy: new mongoose_1.default.Types.ObjectId(userId),
        },
        $inc: {
            revision: 1,
        },
    }, {
        new: true,
        runValidators: true,
        session,
    });
};
exports.updateSettingsAtomically = updateSettingsAtomically;
