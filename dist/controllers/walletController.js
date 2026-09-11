"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAddMoneyTransaction = exports.getAddMoneyHistory = exports.confirmWalletAddMoney = exports.initiateWalletAddMoney = exports.getMyWallet = void 0;
const Wallet_js_1 = require("../models/Wallet.js");
const AddMoneyTransaction_js_1 = require("../models/AddMoneyTransaction.js");
const paymentService_js_1 = require("../services/payment/paymentService.js");
/* =========================================================
   CACHE POLICY
========================================================= */
function setPrivateNoStore(res) {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
}
/* =========================================================
   SAFE STRING
========================================================= */
function readString(value) {
    return typeof value === "string"
        ? value.trim()
        : "";
}
/* =========================================================
   GET MY WALLET
   GET /api/wallet
========================================================= */
const getMyWallet = async (req, res) => {
    try {
        setPrivateNoStore(res);
        const userId = req.user?._id;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: "Not authorized.",
            });
            return;
        }
        const wallet = await Wallet_js_1.Wallet.findOne({
            userId,
        })
            .select("_id userId balance pendingBalance currency status createdAt updatedAt")
            .lean();
        if (!wallet) {
            res.status(404).json({
                success: false,
                message: "Wallet not found.",
            });
            return;
        }
        res.status(200).json({
            success: true,
            wallet,
        });
    }
    catch (error) {
        console.error("GET WALLET ERROR:", error instanceof Error
            ? error.message
            : error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch wallet information.",
        });
    }
};
exports.getMyWallet = getMyWallet;
/* =========================================================
   ADD MONEY
   POST /api/wallet/add-money/initiate

   IMPORTANT:
   This endpoint now uses the same authoritative payment
   service that performs:

   - amount validation
   - idempotency
   - wallet validation
   - payment source verification
   - source balance debit
   - wallet credit
   - payment intent creation
   - provider transaction ID
========================================================= */
const initiateWalletAddMoney = async (req, res) => {
    try {
        setPrivateNoStore(res);
        const userId = req.user?._id;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: "Not authorized.",
            });
            return;
        }
        /* =====================================================
           REQUEST DATA
        ====================================================== */
        const amount = Number(req.body?.amount);
        const providerName = readString(req.body?.providerName);
        const accountNumber = readString(req.body?.accountNumber);
        const secretCode = readString(req.body?.secretCode);
        const referenceValue = readString(req.body?.reference) ||
            readString(req.body?.customerReference);
        const idempotencyKey = readString(req.body?.idempotencyKey);
        /*
         * These values belong to the frontend-facing
         * Add Money transaction contract.
         *
         * The authoritative payment service currently
         * identifies providers by providerName.
         */
        const sourceType = readString(req.body?.sourceType).toUpperCase();
        const provider = readString(req.body?.provider).toUpperCase();
        /* =====================================================
           VALIDATION
        ====================================================== */
        if (!Number.isFinite(amount) ||
            amount <= 0) {
            res.status(400).json({
                success: false,
                message: "Valid amount is required.",
            });
            return;
        }
        if (!providerName) {
            res.status(400).json({
                success: false,
                message: "providerName is required.",
            });
            return;
        }
        if (!accountNumber) {
            res.status(400).json({
                success: false,
                message: "accountNumber is required.",
            });
            return;
        }
        if (!secretCode) {
            res.status(400).json({
                success: false,
                message: "secretCode is required.",
            });
            return;
        }
        if (!idempotencyKey) {
            res.status(400).json({
                success: false,
                message: "idempotencyKey is required.",
            });
            return;
        }
        /* =====================================================
           AUTHORITATIVE PAYMENT SERVICE
        ====================================================== */
        const result = await (0, paymentService_js_1.createAddMoney)({
            userId: userId.toString(),
            providerName,
            accountNumber,
            secretCode,
            amount,
            reference: referenceValue ||
                undefined,
            idempotencyKey,
        });
        /* =====================================================
           RESPONSE
        ====================================================== */
        const intent = result.intent;
        const wallet = result.wallet;
        const transactionId = intent?._id
            ? intent._id.toString()
            : "";
        const status = typeof intent?.status ===
            "string"
            ? intent.status
            : "SUCCESS";
        /*
         * Preserve compatibility with the previous frontend
         * response shape.
         */
        res.status(result.duplicate
            ? 200
            : 201).json({
            success: true,
            transaction: {
                transactionId,
                providerTransactionId: result.providerTransactionId ??
                    null,
                status,
                verificationRequired: false,
                /*
                 * Current paymentService completes
                 * the payment inside the request.
                 *
                 * Therefore no second verification request
                 * is required.
                 */
                verificationRequiredAt: null,
            },
            wallet: wallet
                ? {
                    _id: wallet._id,
                    userId: wallet.userId,
                    balance: wallet.balance,
                    pendingBalance: wallet.pendingBalance,
                    currency: wallet.currency,
                    status: wallet.status,
                }
                : null,
            duplicate: result.duplicate,
            /*
             * Kept for response compatibility.
             */
            sourceType: sourceType || null,
            provider: provider || null,
            message: result.duplicate
                ? "This Add Money request was already processed."
                : "Money added successfully.",
        });
    }
    catch (error) {
        console.error("INITIATE ADD MONEY ERROR:", error instanceof Error
            ? error.message
            : error);
        res.status(400).json({
            success: false,
            message: error instanceof Error
                ? error.message
                : "Unable to add money.",
        });
    }
};
exports.initiateWalletAddMoney = initiateWalletAddMoney;
/* =========================================================
   CONFIRM ADD MONEY

   POST /api/wallet/add-money/confirm

   The current payment service completes Add Money during
   initiateWalletAddMoney().

   This endpoint is therefore kept as a compatibility
   endpoint so an older frontend does not fail.

   It NEVER credits the wallet a second time.
========================================================= */
const confirmWalletAddMoney = async (req, res) => {
    try {
        setPrivateNoStore(res);
        const userId = req.user?._id;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: "Not authorized.",
            });
            return;
        }
        const transactionId = readString(req.body?.transactionId);
        if (!transactionId) {
            res.status(400).json({
                success: false,
                message: "Transaction ID is required.",
            });
            return;
        }
        /*
         * Never trust transaction ID alone.
         *
         * Ownership is enforced by userId.
         */
        const transaction = await AddMoneyTransaction_js_1.AddMoneyTransaction.findOne({
            _id: transactionId,
            userId,
        })
            .select([
            "_id",
            "amount",
            "currency",
            "sourceType",
            "provider",
            "providerName",
            "status",
            "providerTransactionId",
            "maskedAccount",
            "customerReference",
            "initiatedAt",
            "completedAt",
            "creditedAt",
            "balanceBefore",
            "balanceAfter",
            "failureReason",
            "createdAt",
            "updatedAt",
        ].join(" "))
            .lean();
        /*
         * The current createAddMoney service uses PaymentIntent
         * as its authoritative transaction document.
         *
         * Therefore AddMoneyTransaction may not contain the
         * transaction ID generated by that flow.
         *
         * Return a safe compatibility response rather than
         * performing a second financial mutation.
         */
        if (!transaction) {
            res.status(404).json({
                success: false,
                message: "Add Money transaction not found.",
            });
            return;
        }
        if (transaction.status ===
            "SUCCESS") {
            res.status(200).json({
                success: true,
                transaction,
                message: "Add Money transaction is already completed.",
            });
            return;
        }
        if (transaction.status ===
            "FAILED" ||
            transaction.status ===
                "CANCELLED") {
            res.status(409).json({
                success: false,
                transaction,
                message: "This Add Money transaction cannot be confirmed.",
            });
            return;
        }
        res.status(200).json({
            success: true,
            transaction,
            message: "Transaction is still being processed.",
        });
    }
    catch (error) {
        console.error("CONFIRM ADD MONEY ERROR:", error instanceof Error
            ? error.message
            : error);
        res.status(500).json({
            success: false,
            message: "Unable to confirm Add Money transaction.",
        });
    }
};
exports.confirmWalletAddMoney = confirmWalletAddMoney;
/* =========================================================
   GET ADD MONEY HISTORY
   GET /api/wallet/add-money/history
========================================================= */
const getAddMoneyHistory = async (req, res) => {
    try {
        setPrivateNoStore(res);
        const userId = req.user?._id;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: "Not authorized.",
            });
            return;
        }
        const parsedPage = Number(req.query.page);
        const parsedLimit = Number(req.query.limit);
        const page = Number.isFinite(parsedPage)
            ? Math.max(1, Math.floor(parsedPage))
            : 1;
        const limit = Number.isFinite(parsedLimit)
            ? Math.min(50, Math.max(1, Math.floor(parsedLimit)))
            : 20;
        const skip = (page - 1) *
            limit;
        const [transactions, total,] = await Promise.all([
            AddMoneyTransaction_js_1.AddMoneyTransaction.find({
                userId,
            })
                .sort({
                createdAt: -1,
            })
                .skip(skip)
                .limit(limit)
                .select([
                "_id",
                "amount",
                "currency",
                "sourceType",
                "provider",
                "providerName",
                "status",
                "providerTransactionId",
                "maskedAccount",
                "customerReference",
                "initiatedAt",
                "completedAt",
                "creditedAt",
                "balanceBefore",
                "balanceAfter",
                "failureReason",
                "createdAt",
                "updatedAt",
            ].join(" "))
                .lean(),
            AddMoneyTransaction_js_1.AddMoneyTransaction.countDocuments({
                userId,
            }),
        ]);
        res.status(200).json({
            success: true,
            transactions,
            pagination: {
                page,
                limit,
                total,
                pages: Math.max(1, Math.ceil(total /
                    limit)),
            },
        });
    }
    catch (error) {
        console.error("GET ADD MONEY HISTORY ERROR:", error instanceof Error
            ? error.message
            : error);
        res.status(500).json({
            success: false,
            message: "Unable to load Add Money history.",
        });
    }
};
exports.getAddMoneyHistory = getAddMoneyHistory;
/* =========================================================
   GET ONE ADD MONEY TRANSACTION

   GET /api/wallet/add-money/:transactionId
========================================================= */
const getAddMoneyTransaction = async (req, res) => {
    try {
        setPrivateNoStore(res);
        const userId = req.user?._id;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: "Not authorized.",
            });
            return;
        }
        const transactionId = readString(req.params
            .transactionId);
        if (!transactionId) {
            res.status(400).json({
                success: false,
                message: "Transaction ID is required.",
            });
            return;
        }
        const transaction = await AddMoneyTransaction_js_1.AddMoneyTransaction.findOne({
            _id: transactionId,
            userId,
        })
            .select([
            "_id",
            "amount",
            "currency",
            "sourceType",
            "provider",
            "providerName",
            "status",
            "providerTransactionId",
            "maskedAccount",
            "customerReference",
            "initiatedAt",
            "completedAt",
            "creditedAt",
            "balanceBefore",
            "balanceAfter",
            "failureReason",
            "createdAt",
            "updatedAt",
        ].join(" "))
            .lean();
        if (!transaction) {
            res.status(404).json({
                success: false,
                message: "Transaction not found.",
            });
            return;
        }
        res.status(200).json({
            success: true,
            transaction,
        });
    }
    catch (error) {
        console.error("GET ADD MONEY TRANSACTION ERROR:", error instanceof Error
            ? error.message
            : error);
        res.status(500).json({
            success: false,
            message: "Unable to fetch Add Money transaction.",
        });
    }
};
exports.getAddMoneyTransaction = getAddMoneyTransaction;
