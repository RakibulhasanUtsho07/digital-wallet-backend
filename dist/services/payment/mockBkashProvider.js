"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockBkashProvider = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const PaymentSource_js_1 = require("./../../models/PaymentSource.js");
const crypto_js_1 = require("../../utils/crypto.js");
/* =========================================================
   PROVIDER
========================================================= */
const PROVIDER = "bkash";
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
exports.mockBkashProvider = {
    provider: PROVIDER,
    /* =====================================================
       TRANSACTION ID
    ====================================================== */
    createTransactionId() {
        return ("BK-" +
            node_crypto_1.default
                .randomBytes(10)
                .toString("hex")
                .toUpperCase());
    },
    /* =====================================================
       INITIATE PAYMENT
    ====================================================== */
    async initiatePayment(input) {
        return {
            providerTransactionId: this.createTransactionId(),
            status: "PENDING",
            verificationRequired: false,
            message: `Demo bKash payment initialized for ${input.amount} BDT.`,
        };
    },
    /* =====================================================
       VERIFY PAYMENT
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
            message: "Demo bKash payment verified successfully.",
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
                message: "bKash account number is required.",
            };
        }
        /*
         * PaymentSource.accountLookup contains HMAC(account).
         */
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
                message: "bKash account not found.",
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
                ? "bKash account is valid."
                : "bKash account is not active.",
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
                message: "bKash account number is required.",
                status: "FAILED",
            };
        }
        if (!Number.isFinite(amount) ||
            amount <= 0) {
            return {
                success: false,
                providerTransactionId: "",
                message: "Invalid bKash debit amount.",
                status: "FAILED",
            };
        }
        /*
         * IMPORTANT:
         *
         * Do NOT modify PaymentSource here.
         *
         * paymentService.ts performs the actual atomic
         * source debit + wallet credit.
         */
        return {
            success: true,
            providerTransactionId: this.createTransactionId(),
            message: "Demo bKash debit authorized successfully.",
            status: "SUCCESS",
        };
    },
};
