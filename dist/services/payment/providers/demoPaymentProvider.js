"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDemoProvider = exports.DemoPaymentProvider = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const PaymentSource_js_1 = require("../../../models/PaymentSource.js");
/* =========================================================
   HELPERS
========================================================= */
const normalizeAccountNumber = (value) => {
    return value
        .trim()
        .replace(/\s+/g, "");
};
/* =========================================================
   DEMO PROVIDER
========================================================= */
class DemoPaymentProvider {
    provider;
    constructor(provider) {
        this.provider = provider;
    }
    /* =======================================================
       TRANSACTION ID
    ====================================================== */
    createTransactionId() {
        return (`DEMO-${this.provider.toUpperCase()}-` +
            node_crypto_1.default
                .randomBytes(10)
                .toString("hex")
                .toUpperCase());
    }
    /* =======================================================
       INITIATE PAYMENT
    ====================================================== */
    async initiatePayment(input) {
        return {
            providerTransactionId: this.createTransactionId(),
            status: "PENDING",
            verificationRequired: true,
            /*
             * Demo-only verification code.
             *
             * This is NOT used by the current add-money flow.
             */
            demoCode: String(node_crypto_1.default.randomInt(100000, 1000000)),
            message: `Demo ${input.sourceType} payment initialized successfully.`,
        };
    }
    /* =======================================================
       VERIFY PAYMENT
    ====================================================== */
    async verifyPayment(input) {
        const code = input.verificationCode.trim();
        if (!/^\d{6}$/.test(code)) {
            return {
                success: false,
                status: "FAILED",
                message: "Verification code must contain exactly 6 digits.",
            };
        }
        /*
         * Demo adapter only.
         *
         * Real provider adapter will verify against the
         * actual provider API.
         */
        return {
            success: true,
            status: "SUCCESS",
            message: "Demo payment verified successfully.",
        };
    }
    /* =======================================================
       VALIDATE ACCOUNT
    ====================================================== */
    async validateAccount(accountNumber) {
        const normalizedAccount = normalizeAccountNumber(accountNumber);
        if (!normalizedAccount) {
            return {
                exists: false,
                active: false,
                message: "Account number is required.",
            };
        }
        /*
         * PaymentSource stores demo provider accounts.
         *
         * This lookup is used by the adapter.
         *
         * The authoritative secure verification is performed
         * by paymentService.ts using HMAC account lookup and
         * secret-code verification.
         */
        const source = await PaymentSource_js_1.PaymentSource.findOne({
            provider: this.provider,
            accountNumber: normalizedAccount,
        })
            .select("accountNumber accountName balance status currency")
            .lean();
        if (!source) {
            return {
                exists: false,
                active: false,
                message: "Source account does not exist.",
            };
        }
        const active = source.status === "ACTIVE";
        return {
            exists: true,
            active,
            availableBalance: Number(source.balance ?? 0),
            accountName: source.accountName,
            currency: "BDT",
            message: active
                ? "Source account is valid."
                : "Source account is not active.",
        };
    }
    /* =======================================================
       DEBIT
    ====================================================== */
    async debit(accountNumber, amount, _reference) {
        const normalizedAccount = normalizeAccountNumber(accountNumber);
        if (!normalizedAccount) {
            return {
                success: false,
                providerTransactionId: "",
                message: "Account number is required.",
                status: "FAILED",
            };
        }
        if (!Number.isFinite(amount) ||
            amount <= 0) {
            return {
                success: false,
                providerTransactionId: "",
                message: "Invalid debit amount.",
                status: "FAILED",
            };
        }
        /*
         * IMPORTANT
         *
         * Demo provider does NOT modify PaymentSource.balance.
         *
         * paymentService.ts performs:
         *
         *   PaymentSource balance -
         *   Wallet balance +
         *
         * inside the SAME Mongo transaction.
         */
        return {
            success: true,
            providerTransactionId: this.createTransactionId(),
            message: `Demo ${this.provider} debit authorized successfully.`,
            status: "SUCCESS",
        };
    }
}
exports.DemoPaymentProvider = DemoPaymentProvider;
/* =========================================================
   TYPE GUARD
========================================================= */
const isDemoProvider = (provider) => {
    return (provider instanceof
        DemoPaymentProvider);
};
exports.isDemoProvider = isDemoProvider;
