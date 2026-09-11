"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNotification = createNotification;
const mongoose_1 = __importDefault(require("mongoose"));
const Notification_js_1 = require("../models/Notification.js");
const NotificationPreference_js_1 = require("../models/NotificationPreference.js");
const crypto_js_1 = require("../utils/crypto.js");
function normalizeText(value, maxLength) {
    if (typeof value !==
        "string") {
        return "";
    }
    return value
        .trim()
        .slice(0, maxLength);
}
function normalizeActionLink(value) {
    const link = normalizeText(value, 300);
    if (!link) {
        return undefined;
    }
    return link.startsWith("/dashboard/")
        ? link
        : undefined;
}
function categoryKey(type) {
    return type.toLowerCase();
}
function normalizeAmount(value) {
    if (value ===
        undefined) {
        return undefined;
    }
    const amount = Number(value);
    if (!Number.isFinite(amount) ||
        amount < 0) {
        return undefined;
    }
    const normalized = Math.round(amount * 100) / 100;
    return normalized;
}
async function createNotification(input) {
    const title = normalizeText(input.title, 160);
    const message = normalizeText(input.message, 1200);
    if (!title ||
        !message) {
        throw new Error("Notification title and message are required.");
    }
    if (!mongoose_1.default.Types.ObjectId.isValid(String(input.userId))) {
        throw new Error("Invalid notification user ID.");
    }
    const respectPreferences = input.respectPreferences !==
        false;
    if (respectPreferences &&
        input.type !==
            "SECURITY") {
        const preference = await NotificationPreference_js_1.NotificationPreference.findOne({
            userId: input.userId,
        }).lean();
        if (preference) {
            const key = categoryKey(input.type);
            if (preference.channels.inApp ===
                false ||
                preference.categories[key] === false) {
                return null;
            }
        }
    }
    const amount = normalizeAmount(input.amount);
    const amountEncrypted = amount ===
        undefined
        ? undefined
        : (0, crypto_js_1.encryptData)(String(Math.round(amount * 100)));
    const merchant = normalizeText(input.merchant, 120);
    const relatedEntityId = input.relatedEntityId &&
        mongoose_1.default.Types.ObjectId.isValid(String(input.relatedEntityId))
        ? new mongoose_1.default.Types.ObjectId(String(input.relatedEntityId))
        : undefined;
    return Notification_js_1.Notification.create({
        userId: input.userId,
        titleEncrypted: (0, crypto_js_1.encryptData)(title),
        messageEncrypted: (0, crypto_js_1.encryptData)(message),
        amountEncrypted,
        merchantEncrypted: merchant
            ? (0, crypto_js_1.encryptData)(merchant)
            : undefined,
        type: input.type,
        priority: input.priority ||
            "NORMAL",
        actionLink: normalizeActionLink(input.actionLink),
        actionText: normalizeText(input.actionText, 80) ||
            undefined,
        relatedEntityType: normalizeText(input.relatedEntityType, 40) ||
            undefined,
        relatedEntityId,
        createdBy: input.createdBy ||
            "SYSTEM",
    });
}
