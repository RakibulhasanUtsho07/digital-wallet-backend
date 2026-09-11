"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bankProviders = exports.createMockBankProvider = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const PaymentSource_js_1 = require("./../../models/PaymentSource.js");
const crypto_js_1 = require("../../utils/crypto.js");
/* =========================================================
   BANK PROVIDERS
========================================================= */
const BANKS = [
    "dbbl",
    "brac",
    "city",
    "ebl",
    "bankasia",
    "prime",
    "sonali",
];
/* =========================================================
   NORMALIZE
========================================================= */
const normalizeAccountNumber = (value) => {
    return value
        .trim()
        .replace(/\s+/g, "");
};
/* =========================================================
   CREATE BANK PROVIDER
========================================================= */
const createMockBankProvider = (provider) => {
    if (!BANKS.includes(provider)) {
        throw new Error(`Invalid mock bank provider: ${provider}`);
    }
    return {
        provider,
        /* ===================================================
           TRANSACTION ID
        ==================================================== */
        createTransactionId() {
            return (`${provider.toUpperCase()}-` +
                node_crypto_1.default
                    .randomBytes(10)
                    .toString("hex")
                    .toUpperCase());
        },
        /* ===================================================
           INITIATE
        ==================================================== */
        async initiatePayment(input) {
            return {
                providerTransactionId: this.createTransactionId(),
                status: "PENDING",
                verificationRequired: false,
                message: `Demo ${provider} bank payment initialized for ${input.amount} BDT.`,
            };
        },
        /* ===================================================
           VERIFY
        ==================================================== */
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
                message: `Demo ${provider} payment verified successfully.`,
            };
        },
        /* ===================================================
           VALIDATE ACCOUNT
        ==================================================== */
        async validateAccount(accountNumber) {
            const normalized = normalizeAccountNumber(accountNumber);
            if (!normalized) {
                return {
                    exists: false,
                    active: false,
                    message: `${provider.toUpperCase()} account number is required.`,
                };
            }
            /*
             * PaymentSource.accountLookup =
             *
             * HMAC(accountNumber)
             */
            const accountLookup = (0, crypto_js_1.createLookupHash)(normalized);
            const account = await PaymentSource_js_1.PaymentSource.findOne({
                provider,
                accountLookup,
            })
                .select("accountNumber accountName balance status currency")
                .lean();
            if (!account) {
                return {
                    exists: false,
                    active: false,
                    message: `${provider.toUpperCase()} bank account not found.`,
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
                    ? `${provider.toUpperCase()} bank account is valid.`
                    : `${provider.toUpperCase()} bank account is not active.`,
            };
        },
        /* ===================================================
           DEBIT
        ==================================================== */
        async debit(accountNumber, amount, _reference) {
            const normalized = normalizeAccountNumber(accountNumber);
            if (!normalized) {
                return {
                    success: false,
                    providerTransactionId: "",
                    message: "Bank account number is required.",
                    status: "FAILED",
                };
            }
            if (!Number.isFinite(amount) ||
                amount <= 0) {
                return {
                    success: false,
                    providerTransactionId: "",
                    message: "Invalid bank debit amount.",
                    status: "FAILED",
                };
            }
            /*
             * IMPORTANT:
             *
             * No PaymentSource mutation here.
             *
             * paymentService.ts performs atomic source
             * balance deduction + wallet credit.
             */
            return {
                success: true,
                providerTransactionId: this.createTransactionId(),
                message: `Demo ${provider} bank debit authorized successfully.`,
                status: "SUCCESS",
            };
        },
    };
};
exports.createMockBankProvider = createMockBankProvider;
/* =========================================================
   ALL BANK PROVIDERS
========================================================= */
exports.bankProviders = BANKS.map((provider) => (0, exports.createMockBankProvider)(provider));
