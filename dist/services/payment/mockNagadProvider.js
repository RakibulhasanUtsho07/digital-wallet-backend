"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockNagadProvider = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const PaymentSource_js_1 = require("./../../models/PaymentSource.js");
const crypto_js_1 = require("../../utils/crypto.js");
/* =========================================================
   PROVIDER
========================================================= */
const PROVIDER = "nagad";
/* =========================================================
   NORMALIZE ACCOUNT
========================================================= */
const normalizeAccountNumber = (value) => {
    return value
        .trim()
        .replace(/\s+/g, "");
};
/* =========================================================
   PROVIDER
========================================================= */
exports.mockNagadProvider = {
    provider: PROVIDER,
    /* =====================================================
       TRANSACTION ID
    ====================================================== */
    createTransactionId() {
        return ("NG-" +
            node_crypto_1.default
                .randomBytes(10)
                .toString("hex")
                .toUpperCase());
    },
    /* =====================================================
       INITIATE
    ====================================================== */
    async initiatePayment(input) {
        return {
            providerTransactionId: this.createTransactionId(),
            status: "PENDING",
            verificationRequired: false,
            message: `Demo Nagad payment initialized for ${input.amount} BDT.`,
        };
    },
    /* =====================================================
       VERIFY
    ====================================================== */
    async verifyPayment(input) {
        const code = input.verificationCode.trim();
        if (!code) {
            return {
                success: false,
                status: "FAILED",
                message: "Verification code is required.",
            };
        }
        return {
            success: true,
            status: "SUCCESS",
            message: "Demo Nagad payment verified successfully.",
        };
    },
    /* =====================================================
       VALIDATE ACCOUNT
    ====================================================== */
    async validateAccount(accountNumber) {
        const normalized = normalizeAccountNumber(accountNumber);
        if (!normalized) {
            return {
                exists: false,
                active: false,
                message: "Nagad account number is required.",
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
                message: "Nagad account not found.",
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
                ? "Nagad account is valid."
                : "Nagad account is not active.",
        };
    },
    /* =====================================================
       DEBIT
    ====================================================== */
    async debit(accountNumber, amount, _reference) {
        const normalized = normalizeAccountNumber(accountNumber);
        if (!normalized) {
            return {
                success: false,
                providerTransactionId: "",
                message: "Nagad account number is required.",
                status: "FAILED",
            };
        }
        if (!Number.isFinite(amount) ||
            amount <= 0) {
            return {
                success: false,
                providerTransactionId: "",
                message: "Invalid Nagad debit amount.",
                status: "FAILED",
            };
        }
        return {
            success: true,
            providerTransactionId: this.createTransactionId(),
            message: "Demo Nagad debit authorized successfully.",
            status: "SUCCESS",
        };
    },
};
