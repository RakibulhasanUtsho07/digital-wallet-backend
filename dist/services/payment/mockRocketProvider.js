"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockRocketProvider = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const PaymentSource_js_1 = require("./../../models/PaymentSource.js");
const crypto_js_1 = require("../../utils/crypto.js");
/* =========================================================
   PROVIDER
========================================================= */
const PROVIDER = "rocket";
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
exports.mockRocketProvider = {
    provider: PROVIDER,
    /* =====================================================
       TRANSACTION ID
    ====================================================== */
    createTransactionId() {
        return ("RK-" +
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
            message: `Demo Rocket payment initialized for ${input.amount} BDT.`,
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
            message: "Demo Rocket payment verified successfully.",
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
                message: "Rocket account number is required.",
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
                message: "Rocket account not found.",
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
                ? "Rocket account is valid."
                : "Rocket account is not active.",
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
                message: "Rocket account number is required.",
                status: "FAILED",
            };
        }
        if (!Number.isFinite(amount) ||
            amount <= 0) {
            return {
                success: false,
                providerTransactionId: "",
                message: "Invalid Rocket debit amount.",
                status: "FAILED",
            };
        }
        return {
            success: true,
            providerTransactionId: this.createTransactionId(),
            message: "Demo Rocket debit authorized successfully.",
            status: "SUCCESS",
        };
    },
};
