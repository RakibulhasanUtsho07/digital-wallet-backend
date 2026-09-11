"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.withdrawFunds = exports.depositFunds = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Transaction_js_1 = require("../models/Transaction.js");
const Wallet_js_1 = require("../models/Wallet.js");
const crypto_js_1 = require("../utils/crypto.js");
/* =========================================================
   CONSTANTS
========================================================= */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REFERENCE_LENGTH = 160;
/* =========================================================
   AMOUNT
========================================================= */
const parseAmount = (value) => {
    const raw = typeof value === "number"
        ? String(value)
        : typeof value === "string"
            ? value.trim()
            : "";
    if (!raw) {
        return {
            error: "Amount is required",
        };
    }
    if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) {
        return {
            error: "Amount must be a valid number with at most 2 decimal places",
        };
    }
    const numericAmount = Number(raw);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return {
            error: "Amount must be greater than 0",
        };
    }
    const minorUnits = Math.round(numericAmount * 100);
    if (!Number.isSafeInteger(minorUnits) || minorUnits <= 0) {
        return {
            error: "Amount is outside the supported range",
        };
    }
    return {
        minorUnits,
        amount: minorUnits / 100,
    };
};
/* =========================================================
   REFERENCE
========================================================= */
const parseReference = (value) => {
    if (value == null) {
        return {};
    }
    if (typeof value !== "string") {
        return {
            error: "Reference must be text",
        };
    }
    const reference = value.trim();
    if (!reference) {
        return {};
    }
    if (reference.length > MAX_REFERENCE_LENGTH) {
        return {
            error: `Reference must be ${MAX_REFERENCE_LENGTH} characters or fewer`,
        };
    }
    return {
        reference,
    };
};
/* =========================================================
   IDEMPOTENCY
========================================================= */
const getIdempotencyKey = (req) => {
    const raw = req.get("Idempotency-Key");
    if (!raw || !raw.trim()) {
        return {
            error: "Idempotency-Key header is required",
        };
    }
    const key = raw.trim();
    if (!UUID_PATTERN.test(key)) {
        return {
            error: "Idempotency-Key must be a valid UUID",
        };
    }
    return {
        key,
    };
};
/* =========================================================
   ENCRYPTED TRANSACTION HELPERS
========================================================= */
const isEncryptedValue = (value) => {
    if (!value || typeof value !== "object") {
        return false;
    }
    const candidate = value;
    return (typeof candidate.encrypted === "string" &&
        typeof candidate.iv === "string" &&
        typeof candidate.authTag === "string");
};
const getTransactionMinorUnits = (transaction) => {
    if (!isEncryptedValue(transaction.amountEncrypted)) {
        throw new Error("Encrypted transaction amount is missing or invalid");
    }
    const decrypted = Number((0, crypto_js_1.decryptData)(transaction.amountEncrypted));
    if (!Number.isSafeInteger(decrypted) || decrypted < 0) {
        throw new Error("Invalid decrypted transaction amount");
    }
    return decrypted;
};
const getTransactionReference = (transaction) => {
    if (!transaction.referenceEncrypted) {
        return undefined;
    }
    if (!isEncryptedValue(transaction.referenceEncrypted)) {
        throw new Error("Invalid encrypted transaction reference");
    }
    return (0, crypto_js_1.decryptData)(transaction.referenceEncrypted);
};
const transactionMatchesRequest = (transaction, action, minorUnits, reference) => {
    const existingType = String(transaction.type || "").toUpperCase();
    const existingMinorUnits = getTransactionMinorUnits(transaction);
    const existingReference = getTransactionReference(transaction) || "";
    return (existingType === action &&
        existingMinorUnits === minorUnits &&
        existingReference === (reference || ""));
};
/* =========================================================
   RESPONSE BUILDER
========================================================= */
const buildPayload = (wallet, transaction, duplicate) => {
    const amount = getTransactionMinorUnits(transaction) / 100;
    const reference = getTransactionReference(transaction);
    const transactionType = String(transaction.type || "DEPOSIT").toUpperCase();
    const currency = typeof transaction.currency === "string" && transaction.currency.trim()
        ? transaction.currency
        : typeof wallet.currency === "string" && wallet.currency.trim()
            ? wallet.currency
            : "BDT";
    return {
        success: true,
        duplicate,
        message: duplicate
            ? "This request was already processed successfully"
            : transactionType === "DEPOSIT"
                ? "Funds deposited successfully"
                : "Funds withdrawn successfully",
        wallet: {
            _id: String(wallet._id),
            balance: Number(wallet.balance) || 0,
            status: typeof wallet.status === "string"
                ? wallet.status
                : "ACTIVE",
            currency,
        },
        transaction: {
            _id: String(transaction._id),
            type: transactionType,
            status: "COMPLETED",
            amount,
            currency,
            reference,
            createdAt: transaction.createdAt instanceof Date
                ? transaction.createdAt.toISOString()
                : typeof transaction.createdAt === "string"
                    ? transaction.createdAt
                    : undefined,
        },
    };
};
/* =========================================================
   PROCESS FUNDS ACTION
========================================================= */
const processFundsAction = async (action, req, res) => {
    if (!req.user?._id) {
        res.status(401).json({
            success: false,
            message: "Not authorized",
        });
        return;
    }
    const parsedAmount = parseAmount(req.body?.amount);
    if ("error" in parsedAmount) {
        res.status(400).json({
            success: false,
            message: parsedAmount.error,
        });
        return;
    }
    const parsedReference = parseReference(req.body?.reference);
    if ("error" in parsedReference) {
        res.status(400).json({
            success: false,
            message: parsedReference.error,
        });
        return;
    }
    const parsedKey = getIdempotencyKey(req);
    if ("error" in parsedKey) {
        res.status(400).json({
            success: false,
            message: parsedKey.error,
        });
        return;
    }
    const userId = req.user._id;
    const { amount, minorUnits } = parsedAmount;
    const { reference } = parsedReference;
    const idempotencyKey = parsedKey.key;
    /* ---------------------------------------------------------
       FAST DUPLICATE CHECK
    --------------------------------------------------------- */
    const existingTransaction = await Transaction_js_1.Transaction.findOne({
        senderId: userId,
        idempotencyKey,
    }).lean();
    if (existingTransaction) {
        if (!transactionMatchesRequest(existingTransaction, action, minorUnits, reference)) {
            res.status(409).json({
                success: false,
                message: "This Idempotency-Key was already used for a different request",
            });
            return;
        }
        const currentWallet = await Wallet_js_1.Wallet.findOne({
            userId,
        }).lean();
        if (!currentWallet) {
            res.status(404).json({
                success: false,
                message: "Wallet not found",
            });
            return;
        }
        res.status(200).json(buildPayload(currentWallet, existingTransaction, true));
        return;
    }
    const session = await mongoose_1.default.startSession();
    let payload = null;
    try {
        await session.withTransaction(async () => {
            /* -------------------------------------------------------
               RE-CHECK INSIDE TRANSACTION
            ------------------------------------------------------- */
            const duplicateInsideSession = await Transaction_js_1.Transaction.findOne({
                senderId: userId,
                idempotencyKey,
            })
                .session(session)
                .lean();
            if (duplicateInsideSession) {
                if (!transactionMatchesRequest(duplicateInsideSession, action, minorUnits, reference)) {
                    const conflictError = new Error("IDEMPOTENCY_CONFLICT");
                    throw conflictError;
                }
                const walletForDuplicate = await Wallet_js_1.Wallet.findOne({
                    userId,
                })
                    .session(session)
                    .lean();
                if (!walletForDuplicate) {
                    throw new Error("WALLET_NOT_FOUND");
                }
                payload = buildPayload(walletForDuplicate, duplicateInsideSession, true);
                return;
            }
            /* -------------------------------------------------------
               WALLET
            ------------------------------------------------------- */
            const wallet = await Wallet_js_1.Wallet.findOne({
                userId,
            }).session(session);
            if (!wallet) {
                throw new Error("WALLET_NOT_FOUND");
            }
            if (wallet.status &&
                wallet.status !== "ACTIVE") {
                throw new Error(`WALLET_INACTIVE:${wallet.status}`);
            }
            /* -------------------------------------------------------
               BALANCE UPDATE
            ------------------------------------------------------- */
            const updatedWallet = action === "DEPOSIT"
                ? await Wallet_js_1.Wallet.findOneAndUpdate({
                    userId,
                    status: "ACTIVE",
                }, {
                    $inc: {
                        balance: amount,
                    },
                }, {
                    new: true,
                    session,
                })
                : await Wallet_js_1.Wallet.findOneAndUpdate({
                    userId,
                    status: "ACTIVE",
                    balance: {
                        $gte: amount,
                    },
                }, {
                    $inc: {
                        balance: -amount,
                    },
                }, {
                    new: true,
                    session,
                });
            if (!updatedWallet) {
                if (action === "WITHDRAW") {
                    throw new Error("INSUFFICIENT_BALANCE");
                }
                throw new Error("WALLET_UNAVAILABLE");
            }
            /* -------------------------------------------------------
               ENCRYPT TRANSACTION DATA
            ------------------------------------------------------- */
            const amountEncrypted = (0, crypto_js_1.encryptData)(String(minorUnits));
            const referenceEncrypted = reference
                ? (0, crypto_js_1.encryptData)(reference)
                : undefined;
            /* -------------------------------------------------------
               TRANSACTION RECORD
      
               senderId + receiverId are both the authenticated user
               for self-wallet funding actions. `type` identifies the
               actual direction (DEPOSIT / WITHDRAW).
            ------------------------------------------------------- */
            const createdTransactions = await Transaction_js_1.Transaction.create([
                {
                    senderId: userId,
                    receiverId: userId,
                    idempotencyKey,
                    amountEncrypted,
                    referenceEncrypted,
                    currency: updatedWallet.currency ||
                        "BDT",
                    type: action,
                    status: "COMPLETED",
                    riskScore: "LOW",
                },
            ], {
                session,
            });
            const createdTransaction = createdTransactions[0];
            payload = buildPayload(updatedWallet, createdTransaction, false);
        });
    }
    catch (error) {
        const message = error instanceof Error
            ? error.message
            : "";
        if (message === "IDEMPOTENCY_CONFLICT") {
            res.status(409).json({
                success: false,
                message: "This Idempotency-Key was already used for a different request",
            });
            return;
        }
        if (message === "WALLET_NOT_FOUND") {
            res.status(404).json({
                success: false,
                message: "Wallet not found",
            });
            return;
        }
        if (message.startsWith("WALLET_INACTIVE:")) {
            const walletStatus = message.split(":")[1] ||
                "UNKNOWN";
            res.status(403).json({
                success: false,
                message: "Wallet is not active",
                walletStatus,
            });
            return;
        }
        if (message === "INSUFFICIENT_BALANCE") {
            const latestWallet = await Wallet_js_1.Wallet.findOne({
                userId,
            })
                .select("balance")
                .lean();
            res.status(400).json({
                success: false,
                message: "Insufficient wallet balance",
                wallet: {
                    balance: latestWallet?.balance ??
                        0,
                },
            });
            return;
        }
        /* ---------------------------------------------------------
           DUPLICATE-KEY RACE RECOVERY
        --------------------------------------------------------- */
        const mongoError = error;
        if (mongoError?.code === 11000) {
            const winner = await Transaction_js_1.Transaction.findOne({
                senderId: userId,
                idempotencyKey,
            }).lean();
            const latestWallet = await Wallet_js_1.Wallet.findOne({
                userId,
            }).lean();
            if (winner &&
                latestWallet &&
                transactionMatchesRequest(winner, action, minorUnits, reference)) {
                res.status(200).json(buildPayload(latestWallet, winner, true));
                return;
            }
            res.status(409).json({
                success: false,
                message: "A conflicting request was already processed. Please refresh and try again.",
            });
            return;
        }
        console.error(`${action} funds error:`, error);
        res.status(500).json({
            success: false,
            message: action === "DEPOSIT"
                ? "Failed to deposit funds"
                : "Failed to withdraw funds",
        });
        return;
    }
    finally {
        await session.endSession();
    }
    if (!payload) {
        res.status(500).json({
            success: false,
            message: "Funds operation did not complete",
        });
        return;
    }
    res.status(200).json(payload);
};
/* =========================================================
   DEPOSIT FUNDS
   POST /api/funds/deposit
========================================================= */
const depositFunds = async (req, res) => {
    await processFundsAction("DEPOSIT", req, res);
};
exports.depositFunds = depositFunds;
/* =========================================================
   WITHDRAW FUNDS
   POST /api/funds/withdraw
========================================================= */
const withdrawFunds = async (req, res) => {
    await processFundsAction("WITHDRAW", req, res);
};
exports.withdrawFunds = withdrawFunds;
