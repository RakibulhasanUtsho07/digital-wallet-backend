"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockUpayProvider = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const PaymentSource_js_1 = require("./../../models/PaymentSource.js");
const crypto_js_1 = require("../../utils/crypto.js");
const PROVIDER = "upay";
const normalizeAccountNumber = (value) => {
    return value
        .trim()
        .replace(/\s+/g, "");
};
exports.mockUpayProvider = {
    provider: PROVIDER,
    createTransactionId() {
        return ("UP-" +
            node_crypto_1.default
                .randomBytes(10)
                .toString("hex")
                .toUpperCase());
    },
    async initiatePayment(input) {
        return {
            providerTransactionId: this.createTransactionId(),
            status: "PENDING",
            verificationRequired: false,
            message: `Demo upay payment initialized for ${input.amount} BDT.`,
        };
    },
    async verifyPayment(input) {
        if (!input.verificationCode.trim()) {
            return {
                success: false,
                status: "FAILED",
                message: "Verification code is required.",
            };
        }
        return {
            success: true,
            status: "SUCCESS",
            message: "Demo upay payment verified successfully.",
        };
    },
    async validateAccount(accountNumber) {
        const normalized = normalizeAccountNumber(accountNumber);
        if (!normalized) {
            return {
                exists: false,
                active: false,
                message: "upay account number is required.",
            };
        }
        const accountLookup = (0, crypto_js_1.createLookupHash)(normalized);
        const account = await PaymentSource_js_1.PaymentSource.findOne({
            provider: PROVIDER,
            accountLookup,
        })
            .select("accountNumber accountName balance status currency")
            .lean();
        if (!account) {
            return {
                exists: false,
                active: false,
                message: "upay account not found.",
            };
        }
        const active = account.status ===
            "ACTIVE";
        return {
            exists: true,
            active,
            availableBalance: Number(account.balance ?? 0),
            accountName: account.accountName,
            currency: "BDT",
            message: active
                ? "upay account is valid."
                : "upay account is not active.",
        };
    },
    async debit(accountNumber, amount, _reference) {
        if (!normalizeAccountNumber(accountNumber)) {
            return {
                success: false,
                providerTransactionId: "",
                message: "upay account number is required.",
                status: "FAILED",
            };
        }
        if (!Number.isFinite(amount) ||
            amount <= 0) {
            return {
                success: false,
                providerTransactionId: "",
                message: "Invalid upay debit amount.",
                status: "FAILED",
            };
        }
        return {
            success: true,
            providerTransactionId: this.createTransactionId(),
            message: "Demo upay debit authorized successfully.",
            status: "SUCCESS",
        };
    },
};
