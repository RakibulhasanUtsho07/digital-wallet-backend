"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const paymentController_js_1 = require("../controllers/paymentController.js");
const authMiddleware_js_1 = require("../middlewares/authMiddleware.js");
const securityRateLimiters_js_1 = require("../middlewares/securityRateLimiters.js");
const router = express_1.default.Router();
/* =========================================================
   VALIDATE PAYMENT SOURCE

   POST /api/payment/validate-source
========================================================= */
router.post("/validate-source", authMiddleware_js_1.protect, securityRateLimiters_js_1.securityReadLimiter, paymentController_js_1.validatePaymentSource);
/* =========================================================
   ADD MONEY

   POST /api/payment/add-money
========================================================= */
router.post("/add-money", authMiddleware_js_1.protect, securityRateLimiters_js_1.securitySensitiveLimiter, paymentController_js_1.addMoney);
exports.default = router;
