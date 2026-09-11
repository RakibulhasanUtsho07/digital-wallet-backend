"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMoney = exports.validateRecipient = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Wallet_js_1 = require("../models/Wallet.js");
const User_js_1 = require("../models/User.js");
const Transaction_js_1 = require("../models/Transaction.js");
const crypto_js_1 = require("../utils/crypto.js");
const password_js_1 = require("../utils/password.js");
/* =========================================================
   HELPERS
========================================================= */
/*
 * Normal text fields:
 * recipient, reference etc.
 */
const toTrimmedString = (value) => {
    return typeof value === "string"
        ? value.trim()
        : "";
};
/*
 * Password MUST NOT be trimmed.
 *
 * Login password verification-এর সময়
 * exact value preserve করতে হবে।
 */
const toRawString = (value) => {
    return typeof value === "string"
        ? value
        : "";
};
/* =========================================================
   IDEMPOTENCY KEY VALIDATION
========================================================= */
/*
 * Frontend will generate the key using:
 *
 * crypto.randomUUID()
 *
 * Example:
 * 550e8400-e29b-41d4-a716-446655440000
 */
const isValidIdempotencyKey = (value) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return (value.length <= 128 &&
        uuidRegex.test(value));
};
/* =========================================================
   DUPLICATE KEY ERROR
========================================================= */
const isIdempotencyDuplicateError = (error) => {
    if (!error ||
        typeof error !== "object") {
        return false;
    }
    const mongoError = error;
    if (mongoError.code !== 11000) {
        return false;
    }
    if (mongoError.keyPattern
        ?.idempotencyKey) {
        return true;
    }
    return (typeof mongoError.message === "string" &&
        mongoError.message.includes("idempotencyKey"));
};
/* =========================================================
   DECRYPT STORED VALUE
========================================================= */
const decryptStoredValue = (value) => {
    if (!value ||
        typeof value !== "object") {
        throw new Error("Encrypted transaction data is missing.");
    }
    const encrypted = value;
    if (typeof encrypted.encrypted !==
        "string" ||
        typeof encrypted.iv !==
            "string" ||
        typeof encrypted.authTag !==
            "string") {
        throw new Error("Invalid encrypted transaction data.");
    }
    return (0, crypto_js_1.decryptData)({
        encrypted: encrypted.encrypted,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
    });
};
/* =========================================================
   GET STORED TRANSACTION AMOUNT

   Returns minor units.

   Example:
   encrypted "50000"
   -> 50000 poisha
========================================================= */
const getStoredAmountMinorUnits = (value) => {
    const decrypted = decryptStoredValue(value);
    const minorUnits = Number(decrypted);
    if (!Number.isSafeInteger(minorUnits) ||
        minorUnits <= 0) {
        throw new Error("Invalid stored transaction amount.");
    }
    return minorUnits;
};
/* =========================================================
   GET STORED REFERENCE
========================================================= */
const getStoredReference = (value) => {
    /*
     * Reference is optional.
     */
    if (!value) {
        return "";
    }
    return decryptStoredValue(value);
};
/* =========================================================
   FIND RECIPIENT

   Supports:
   - Email
   - Phone
========================================================= */
const findRecipient = async (identifier, session) => {
    const raw = identifier.trim();
    if (!raw) {
        return null;
    }
    /* =======================================================
       EMAIL
    ======================================================== */
    if (raw.includes("@")) {
        const normalizedEmail = (0, crypto_js_1.normalizeEmail)(raw);
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normalizedEmail)) {
            return null;
        }
        const emailLookup = (0, crypto_js_1.createLookupHash)(normalizedEmail);
        const query = User_js_1.User.findOne({
            emailLookup,
        });
        if (session) {
            query.session(session);
        }
        return query;
    }
    /* =======================================================
       PHONE
    ======================================================== */
    const normalizedPhone = (0, crypto_js_1.normalizePhone)(raw);
    const digits = normalizedPhone.replace(/\D/g, "");
    /*
     * Generic international-style
     * phone length validation.
     */
    if (digits.length < 8 ||
        digits.length > 15) {
        return null;
    }
    const phoneLookup = (0, crypto_js_1.createLookupHash)(normalizedPhone);
    const query = User_js_1.User.findOne({
        phoneLookup,
    });
    if (session) {
        query.session(session);
    }
    return query;
};
/* =========================================================
   VALIDATE RECIPIENT

   POST /api/transfers/validate-recipient
========================================================= */
const validateRecipient = async (req, res) => {
    try {
        const senderId = req.user?._id;
        /* =====================================================
           AUTH
        ====================================================== */
        if (!senderId) {
            res.status(401).json({
                success: false,
                valid: false,
                message: "Authentication required.",
            });
            return;
        }
        /* =====================================================
           RECIPIENT INPUT
        ====================================================== */
        const recipient = toTrimmedString(req.body.recipient);
        if (!recipient) {
            res.status(400).json({
                success: false,
                valid: false,
                message: "Enter a phone number or email address.",
            });
            return;
        }
        /* =====================================================
           FIND ACCOUNT
        ====================================================== */
        const recipientUser = await findRecipient(recipient);
        if (!recipientUser) {
            res.status(404).json({
                success: false,
                valid: false,
                message: "No account found for this phone number or email.",
            });
            return;
        }
        /* =====================================================
           SELF TRANSFER
        ====================================================== */
        if (recipientUser._id.toString() ===
            senderId.toString()) {
            res.status(400).json({
                success: false,
                valid: false,
                message: "You cannot send money to your own account.",
            });
            return;
        }
        /* =====================================================
           SUCCESS
        ====================================================== */
        res.status(200).json({
            success: true,
            valid: true,
            recipient: {
                name: recipientUser.name,
            },
        });
    }
    catch (error) {
        console.error("VALIDATE RECIPIENT ERROR:", error);
        res.status(500).json({
            success: false,
            valid: false,
            message: "Unable to verify recipient.",
        });
    }
};
exports.validateRecipient = validateRecipient;
/* =========================================================
   SEND MONEY

   POST /api/transfers
========================================================= */
const sendMoney = async (req, res) => {
    const session = await mongoose_1.default.startSession();
    try {
        session.startTransaction();
        /* =====================================================
           BODY
        ====================================================== */
        const { recipient, amount, reference, password, } = req.body;
        const senderId = req.user?._id;
        /* =====================================================
           AUTH CHECK
        ====================================================== */
        if (!senderId) {
            await session.abortTransaction();
            res.status(401).json({
                success: false,
                message: "Authentication required.",
            });
            return;
        }
        /* =====================================================
           IDEMPOTENCY KEY
  
           Every logical transfer must have
           one unique UUID.
        ====================================================== */
        const idempotencyKey = req
            .get("Idempotency-Key")
            ?.trim() || "";
        if (!idempotencyKey) {
            await session.abortTransaction();
            res.status(400).json({
                success: false,
                message: "Idempotency key is required.",
            });
            return;
        }
        if (!isValidIdempotencyKey(idempotencyKey)) {
            await session.abortTransaction();
            res.status(400).json({
                success: false,
                message: "Invalid idempotency key.",
            });
            return;
        }
        /* =====================================================
           PASSWORD REQUIRED
  
           IMPORTANT:
           Password is NOT trimmed.
        ====================================================== */
        const enteredPassword = toRawString(password);
        if (!enteredPassword) {
            await session.abortTransaction();
            res.status(400).json({
                success: false,
                message: "Your login password is required to confirm this transfer.",
            });
            return;
        }
        /* =====================================================
           GET SENDER + PASSWORD HASH
        ====================================================== */
        const senderUser = await User_js_1.User.findById(senderId)
            .select("+password")
            .session(session);
        if (!senderUser) {
            await session.abortTransaction();
            res.status(401).json({
                success: false,
                message: "Authentication failed.",
            });
            return;
        }
        const storedPassword = senderUser.get("password");
        if (!storedPassword) {
            await session.abortTransaction();
            res.status(401).json({
                success: false,
                message: "Authentication failed.",
            });
            return;
        }
        /* =====================================================
           VERIFY LOGIN PASSWORD
        ====================================================== */
        const passwordMatched = await (0, password_js_1.verifyPassword)(storedPassword, enteredPassword);
        if (!passwordMatched) {
            await session.abortTransaction();
            res.status(401).json({
                success: false,
                message: "Incorrect password.",
            });
            return;
        }
        /* =====================================================
           RECIPIENT
        ====================================================== */
        const recipientValue = toTrimmedString(recipient);
        if (!recipientValue) {
            await session.abortTransaction();
            res.status(400).json({
                success: false,
                message: "Recipient phone number or email is required.",
            });
            return;
        }
        /* =====================================================
           VERIFY RECIPIENT AGAIN
  
           Frontend validation alone is never trusted.
        ====================================================== */
        const recipientUser = await findRecipient(recipientValue, session);
        if (!recipientUser) {
            await session.abortTransaction();
            res.status(404).json({
                success: false,
                message: "No account found for this phone number or email.",
            });
            return;
        }
        /* =====================================================
           PREVENT SELF TRANSFER
        ====================================================== */
        if (recipientUser._id.toString() ===
            senderId.toString()) {
            await session.abortTransaction();
            res.status(400).json({
                success: false,
                message: "You cannot send money to your own account.",
            });
            return;
        }
        /* =====================================================
           AMOUNT VALIDATION
        ====================================================== */
        const parsedAmount = Number(amount);
        if (!Number.isFinite(parsedAmount) ||
            parsedAmount <= 0) {
            await session.abortTransaction();
            res.status(400).json({
                success: false,
                message: "Invalid transfer amount.",
            });
            return;
        }
        /*
         * Maximum 2 decimal places.
         */
        const normalizedAmount = Math.round(parsedAmount *
            100) / 100;
        if (Math.abs(parsedAmount -
            normalizedAmount) >
            Number.EPSILON) {
            await session.abortTransaction();
            res.status(400).json({
                success: false,
                message: "Amount can have maximum 2 decimal places.",
            });
            return;
        }
        /* =====================================================
           AMOUNT -> MINOR UNITS
  
           BDT 500.00
           -> 50000 poisha
        ====================================================== */
        const amountInMinorUnits = Math.round(normalizedAmount *
            100);
        if (!Number.isSafeInteger(amountInMinorUnits) ||
            amountInMinorUnits <= 0) {
            await session.abortTransaction();
            res.status(400).json({
                success: false,
                message: "Unable to securely process transaction amount.",
            });
            return;
        }
        /* =====================================================
           REFERENCE
        ====================================================== */
        const referenceValue = toTrimmedString(reference);
        /* =====================================================
           EXISTING IDEMPOTENT TRANSACTION
  
           Same sender + same idempotency key
           must not debit wallet again.
        ====================================================== */
        const existingTransaction = await Transaction_js_1.Transaction.findOne({
            senderId,
            idempotencyKey,
        }).session(session);
        if (existingTransaction) {
            /*
             * Protect against accidentally reusing the same
             * idempotency key for a DIFFERENT transfer.
             */
            const existingAmountMinorUnits = getStoredAmountMinorUnits(existingTransaction.amountEncrypted);
            const existingReference = getStoredReference(existingTransaction.referenceEncrypted);
            const sameReceiver = existingTransaction.receiverId.toString() ===
                recipientUser._id.toString();
            const sameAmount = existingAmountMinorUnits ===
                amountInMinorUnits;
            const sameReference = existingReference ===
                referenceValue;
            if (!sameReceiver ||
                !sameAmount ||
                !sameReference) {
                await session.abortTransaction();
                res.status(409).json({
                    success: false,
                    message: "This idempotency key has already been used for a different transfer.",
                });
                return;
            }
            /*
             * Get current wallet balance so frontend
             * receives the same response structure.
             */
            const currentSenderWallet = await Wallet_js_1.Wallet.findOne({
                userId: senderId,
            }).session(session);
            await session.abortTransaction();
            res.status(200).json({
                success: true,
                duplicate: true,
                message: "This transfer has already been processed.",
                transaction: {
                    _id: existingTransaction._id.toString(),
                    amount: normalizedAmount,
                    status: existingTransaction.status,
                    currency: existingTransaction.currency,
                    reference: referenceValue ||
                        undefined,
                    createdAt: existingTransaction.createdAt,
                },
                wallet: currentSenderWallet
                    ? {
                        balance: currentSenderWallet.balance,
                    }
                    : undefined,
            });
            return;
        }
        /* =====================================================
           SENDER WALLET
        ====================================================== */
        const senderWallet = await Wallet_js_1.Wallet.findOne({
            userId: senderId,
        }).session(session);
        if (!senderWallet) {
            await session.abortTransaction();
            res.status(404).json({
                success: false,
                message: "Sender wallet not found.",
            });
            return;
        }
        /* =====================================================
           BALANCE CHECK
        ====================================================== */
        if (senderWallet.balance <
            normalizedAmount) {
            await session.abortTransaction();
            res.status(400).json({
                success: false,
                message: "Insufficient balance.",
            });
            return;
        }
        /* =====================================================
           RECEIVER WALLET
        ====================================================== */
        const receiverWallet = await Wallet_js_1.Wallet.findOne({
            userId: recipientUser._id,
        }).session(session);
        if (!receiverWallet) {
            await session.abortTransaction();
            res.status(404).json({
                success: false,
                message: "Recipient wallet not found.",
            });
            return;
        }
        /* =====================================================
           UPDATE BALANCES
        ====================================================== */
        senderWallet.balance -=
            normalizedAmount;
        receiverWallet.balance +=
            normalizedAmount;
        await senderWallet.save({
            session,
        });
        await receiverWallet.save({
            session,
        });
        /* =====================================================
           ENCRYPT TRANSACTION AMOUNT
  
           Only encrypted minor units
           are stored in MongoDB.
        ====================================================== */
        const amountEncrypted = (0, crypto_js_1.encryptData)(String(amountInMinorUnits));
        /* =====================================================
           ENCRYPT REFERENCE
  
           Plaintext reference is NEVER stored.
        ====================================================== */
        const referenceEncrypted = referenceValue
            ? (0, crypto_js_1.encryptData)(referenceValue)
            : undefined;
        /* =====================================================
           CREATE TRANSACTION
  
           Stored:
           ✅ amountEncrypted
           ✅ referenceEncrypted
           ✅ idempotencyKey
  
           Not stored:
           ❌ password
           ❌ plaintext amount
           ❌ plaintext reference
        ====================================================== */
        const transactions = await Transaction_js_1.Transaction.create([
            {
                senderId,
                receiverId: recipientUser._id,
                amountEncrypted,
                referenceEncrypted,
                idempotencyKey,
                currency: "BDT",
                type: "TRANSFER",
                status: "COMPLETED",
                riskScore: "LOW",
            },
        ], {
            session,
        });
        const transaction = transactions[0];
        if (!transaction) {
            throw new Error("Transaction creation failed.");
        }
        /* =====================================================
           COMMIT TRANSACTION
        ====================================================== */
        await session.commitTransaction();
        /* =====================================================
           RESPONSE
  
           Decrypted/plain values can be returned
           to the authenticated client.
  
           They are NOT persisted in plaintext.
        ====================================================== */
        res.status(200).json({
            success: true,
            duplicate: false,
            message: "Transfer completed successfully.",
            transaction: {
                _id: transaction._id.toString(),
                amount: normalizedAmount,
                status: transaction.status,
                currency: transaction.currency,
                reference: referenceValue ||
                    undefined,
                createdAt: transaction.createdAt,
            },
            wallet: {
                balance: senderWallet.balance,
            },
        });
    }
    catch (error) {
        /* =====================================================
           ROLLBACK
        ====================================================== */
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        /* =====================================================
           CONCURRENT IDEMPOTENCY RACE
  
           Example:
  
           Request A ─┐
                      ├─ same key
           Request B ─┘
  
           Both may pass the initial findOne before either
           transaction commits.
  
           MongoDB unique index allows only ONE insert.
  
           The losing transaction is rolled back, including
           its wallet balance changes.
        ====================================================== */
        if (isIdempotencyDuplicateError(error)) {
            try {
                const senderId = req.user?._id;
                const idempotencyKey = req
                    .get("Idempotency-Key")
                    ?.trim();
                if (senderId &&
                    idempotencyKey) {
                    const existingTransaction = await Transaction_js_1.Transaction.findOne({
                        senderId,
                        idempotencyKey,
                    });
                    if (existingTransaction) {
                        const amountMinorUnits = getStoredAmountMinorUnits(existingTransaction.amountEncrypted);
                        const reference = getStoredReference(existingTransaction.referenceEncrypted);
                        const senderWallet = await Wallet_js_1.Wallet.findOne({
                            userId: senderId,
                        });
                        res.status(200).json({
                            success: true,
                            duplicate: true,
                            message: "This transfer has already been processed.",
                            transaction: {
                                _id: existingTransaction._id.toString(),
                                amount: amountMinorUnits /
                                    100,
                                status: existingTransaction.status,
                                currency: existingTransaction.currency,
                                reference: reference ||
                                    undefined,
                                createdAt: existingTransaction.createdAt,
                            },
                            wallet: senderWallet
                                ? {
                                    balance: senderWallet.balance,
                                }
                                : undefined,
                        });
                        return;
                    }
                }
                /*
                 * Duplicate was detected but the winner
                 * may still be committing.
                 *
                 * Client can safely retry using SAME key.
                 */
                res.status(409).json({
                    success: false,
                    retryable: true,
                    message: "Duplicate transfer request detected. Retry using the same idempotency key.",
                });
                return;
            }
            catch (duplicateError) {
                console.error("IDEMPOTENCY RECOVERY ERROR:", duplicateError);
                res.status(409).json({
                    success: false,
                    retryable: true,
                    message: "Duplicate transfer request detected. Retry using the same idempotency key.",
                });
                return;
            }
        }
        console.error("SEND MONEY ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Transfer failed.",
        });
    }
    finally {
        await session.endSession();
    }
};
exports.sendMoney = sendMoney;
