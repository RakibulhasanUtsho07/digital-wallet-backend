"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const walletController_js_1 = require("../controllers/walletController.js");
const authMiddleware_js_1 = require("../middlewares/authMiddleware.js");
const securityRateLimiters_js_1 = require("../middlewares/securityRateLimiters.js");
const router = express_1.default.Router();
/* =========================================================
   WALLET
========================================================= */
router.get("/", authMiddleware_js_1.protect, walletController_js_1.getMyWallet);
/* =========================================================
   ADD MONEY
========================================================= */
/*
 * Start Bank/MFS payment
 */
router.post("/add-money/initiate", authMiddleware_js_1.protect, securityRateLimiters_js_1.securitySensitiveLimiter, walletController_js_1.initiateWalletAddMoney);
/*
 * Verify demo/live payment
 * and credit wallet.
 */
router.post("/add-money/confirm", authMiddleware_js_1.protect, securityRateLimiters_js_1.securitySensitiveLimiter, walletController_js_1.confirmWalletAddMoney);
/*
 * Add Money history.
 */
router.get("/add-money/history", authMiddleware_js_1.protect, securityRateLimiters_js_1.securityReadLimiter, walletController_js_1.getAddMoneyHistory);
/*
 * One transaction.
 */
router.get("/add-money/:transactionId", authMiddleware_js_1.protect, securityRateLimiters_js_1.securityReadLimiter, walletController_js_1.getAddMoneyTransaction);
exports.default = router;
