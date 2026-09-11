"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addMoney = exports.validatePaymentSource = void 0;
const paymentService_js_1 = require("../services/payment/paymentService.js");
const securityEventService_js_1 = require("../services/securityEventService.js");
/* =========================================================
   PROVIDERS
========================================================= */
const ALLOWED_PROVIDERS = [
    "bkash",
    "nagad",
    "rocket",
    "upay",
    "dbbl",
    "brac",
    "city",
    "ebl",
    "bankasia",
    "prime",
    "sonali",
];
/* =========================================================
   CONSTANTS
========================================================= */
const MAX_ADD_MONEY_AMOUNT = 500000;
const MIN_ACCOUNT_LENGTH = 8;
const MAX_ACCOUNT_LENGTH = 32;
const MAX_REFERENCE_LENGTH = 160;
const MIN_IDEMPOTENCY_LENGTH = 16;
const MAX_IDEMPOTENCY_LENGTH = 200;
/* =========================================================
   HELPERS
========================================================= */
/*
 * Safely convert Express body/header values to string.
 */
const toStringValue = (value) => {
    if (typeof value ===
        "string") {
        return value.trim();
    }
    if (Array.isArray(value)) {
        const first = value[0];
        return typeof first ===
            "string"
            ? first.trim()
            : "";
    }
    return "";
};
/*
 * Normalize source account.
 */
const normalizeAccountNumber = (value) => {
    return value
        .trim()
        .replace(/\s+/g, "");
};
/*
 * Normalize secret.
 */
const normalizeSecretCode = (value) => {
    return value.trim();
};
/*
 * Normalize provider.
 */
const normalizeProvider = (value) => {
    return value
        .trim()
        .toLowerCase();
};
/*
 * Provider validation.
 */
const isValidProvider = (value) => {
    return (ALLOWED_PROVIDERS.includes(value));
};
/*
 * Reference sanitization.
 */
const sanitizeReference = (value) => {
    const normalized = value.trim();
    if (!normalized) {
        return undefined;
    }
    return normalized.slice(0, MAX_REFERENCE_LENGTH);
};
/*
 * Validate amount safely.
 */
const isValidAmount = (amount) => {
    if (!Number.isFinite(amount)) {
        return false;
    }
    if (amount <= 0) {
        return false;
    }
    if (amount >
        MAX_ADD_MONEY_AMOUNT) {
        return false;
    }
    /*
     * Maximum 2 decimal places.
     */
    const minorUnits = Math.round(amount * 100);
    return (Number.isSafeInteger(minorUnits) &&
        Math.abs(amount -
            minorUnits /
                100) < 0.0000001);
};
/* =========================================================
   VALIDATE PAYMENT SOURCE
   POST /api/payment/validate-source
========================================================= */
const validatePaymentSource = async (req, res) => {
    try {
        /* ===================================================
           AUTH
        ================================================== */
        const userId = req.user?._id;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: "Not authorized.",
            });
            return;
        }
        /* ===================================================
           INPUT
        ================================================== */
        const provider = normalizeProvider(toStringValue(req.body?.provider));
        const accountNumber = normalizeAccountNumber(toStringValue(req.body?.accountNumber));
        const secretCode = normalizeSecretCode(toStringValue(req.body?.secretCode));
        /* ===================================================
           PROVIDER
        ================================================== */
        if (!isValidProvider(provider)) {
            res.status(400).json({
                success: false,
                message: "Unsupported payment provider.",
            });
            return;
        }
        /* ===================================================
           ACCOUNT NUMBER
        ================================================== */
        if (accountNumber.length <
            MIN_ACCOUNT_LENGTH ||
            accountNumber.length >
                MAX_ACCOUNT_LENGTH) {
            res.status(400).json({
                success: false,
                message: "Invalid account number.",
            });
            return;
        }
        /* ===================================================
           SECRET CODE
        ================================================== */
        if (!secretCode) {
            res.status(400).json({
                success: false,
                message: "Secret code is required.",
            });
            return;
        }
        /* ===================================================
           AUTHORITATIVE BACKEND CHECK
        ================================================== */
        const source = await (0, paymentService_js_1.verifyPaymentSource)({
            providerName: provider,
            accountNumber,
            secretCode,
        });
        /* ===================================================
           SECURITY EVENT
        ================================================== */
        await (0, securityEventService_js_1.recordSecurityEvent)({
            userId,
            eventType: "WALLET_DEPOSIT_CREATED",
            title: "Payment source verified",
            status: "success",
            detail: `Payment source ${provider} was verified for wallet funding.`,
            sessionId: req.user?.sessionId,
            req,
        });
        /* ===================================================
           SAFE RESPONSE
        ================================================== */
        res.status(200).json({
            success: true,
            account: {
                provider: source.provider,
                accountNumber: source.accountNumber,
                accountName: source.accountName,
                availableBalance: Number(source.balance ??
                    0),
                currency: source.currency,
                status: source.status,
                verified: true,
            },
            message: "Payment source verified successfully.",
        });
    }
    catch (error) {
        console.error("VALIDATE PAYMENT SOURCE ERROR:", error instanceof Error
            ? error.message
            : error);
        const message = error instanceof Error
            ? error.message
            : "Unable to verify payment source.";
        let statusCode = 400;
        if (message.includes("verification code is incorrect")) {
            statusCode =
                401;
        }
        res.status(statusCode).json({
            success: false,
            message,
        });
    }
};
exports.validatePaymentSource = validatePaymentSource;
/* =========================================================
   ADD MONEY
   POST /api/payment/add-money
========================================================= */
const addMoney = async (req, res) => {
    try {
        /* ===================================================
           AUTH
        ================================================== */
        const userId = req.user?._id;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: "Not authorized.",
            });
            return;
        }
        /* ===================================================
           INPUT
        ================================================== */
        const provider = normalizeProvider(toStringValue(req.body?.provider));
        const accountNumber = normalizeAccountNumber(toStringValue(req.body?.accountNumber));
        const secretCode = normalizeSecretCode(toStringValue(req.body?.secretCode));
        const reference = sanitizeReference(toStringValue(req.body?.reference));
        const idempotencyKey = toStringValue(req.headers["idempotency-key"]);
        const amount = Number(req.body?.amount);
        /* ===================================================
           PROVIDER VALIDATION
        ================================================== */
        if (!isValidProvider(provider)) {
            res.status(400).json({
                success: false,
                message: "Unsupported payment provider.",
            });
            return;
        }
        /* ===================================================
           ACCOUNT VALIDATION
        ================================================== */
        if (accountNumber.length <
            MIN_ACCOUNT_LENGTH ||
            accountNumber.length >
                MAX_ACCOUNT_LENGTH) {
            res.status(400).json({
                success: false,
                message: "Invalid source account number.",
            });
            return;
        }
        /* ===================================================
           SECRET VALIDATION
        ================================================== */
        if (!secretCode) {
            res.status(400).json({
                success: false,
                message: "Source account secret code is required.",
            });
            return;
        }
        /* ===================================================
           AMOUNT VALIDATION
        ================================================== */
        if (!isValidAmount(amount)) {
            res.status(400).json({
                success: false,
                message: "Invalid amount. Amount must be greater than zero and have no more than 2 decimal places.",
            });
            return;
        }
        /* ===================================================
           REFERENCE VALIDATION
        ================================================== */
        if (toStringValue(req.body?.reference).length >
            MAX_REFERENCE_LENGTH) {
            res.status(400).json({
                success: false,
                message: `Reference must be ${MAX_REFERENCE_LENGTH} characters or fewer.`,
            });
            return;
        }
        /* ===================================================
           IDEMPOTENCY VALIDATION
        ================================================== */
        if (!idempotencyKey ||
            idempotencyKey.length <
                MIN_IDEMPOTENCY_LENGTH ||
            idempotencyKey.length >
                MAX_IDEMPOTENCY_LENGTH) {
            res.status(400).json({
                success: false,
                message: "A valid idempotency key is required.",
            });
            return;
        }
        /* ===================================================
           IMPORTANT SECURITY RULE
           
           Frontend verification is NEVER trusted.
           
           We call verifyPaymentSource() again here.
        ================================================== */
        await (0, paymentService_js_1.verifyPaymentSource)({
            providerName: provider,
            accountNumber,
            secretCode,
        });
        /* ===================================================
           CREATE ADD MONEY
        ================================================== */
        const result = await (0, paymentService_js_1.createAddMoney)({
            userId,
            providerName: provider,
            accountNumber,
            secretCode,
            amount,
            reference,
            idempotencyKey,
        });
        /* ===================================================
           DUPLICATE REQUEST
        ================================================== */
        if (result.duplicate) {
            res.status(200).json({
                success: true,
                duplicate: true,
                message: "This payment request was already processed.",
                payment: {
                    id: result.intent._id,
                    status: result.intent.status,
                    amount: result.intent.amount,
                    provider: result.intent.provider,
                    providerTransactionId: result.providerTransactionId ??
                        result.intent
                            .providerTransactionId ??
                        null,
                },
                wallet: result.wallet,
            });
            return;
        }
        /* ===================================================
           SECURITY EVENT
        ================================================== */
        await (0, securityEventService_js_1.recordSecurityEvent)({
            userId,
            eventType: "WALLET_DEPOSIT_CREATED",
            title: "Wallet funded successfully",
            status: "success",
            detail: `Wallet funded through ${provider}. Amount ৳${amount}.`,
            sessionId: req.user?.sessionId,
            req,
        });
        /* ===================================================
           SUCCESS RESPONSE
        ================================================== */
        res.status(201).json({
            success: true,
            message: "Money added successfully.",
            payment: {
                id: result.intent._id,
                status: result.intent.status,
                provider: result.intent.provider,
                amount: result.intent.amount,
                providerTransactionId: result.providerTransactionId ??
                    result.intent
                        .providerTransactionId ??
                    null,
            },
            wallet: result.wallet,
        });
    }
    catch (error) {
        console.error("ADD MONEY ERROR:", error instanceof Error
            ? error.message
            : error);
        if (res.headersSent) {
            return;
        }
        const message = error instanceof Error
            ? error.message
            : "Unable to add money.";
        let statusCode = 400;
        if (message.includes("verification code is incorrect")) {
            statusCode =
                401;
        }
        if (message.includes("not authorized")) {
            statusCode =
                401;
        }
        res.status(statusCode).json({
            success: false,
            message,
        });
    }
};
exports.addMoney = addMoney;
