"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const fundsController_js_1 = require("../controllers/fundsController.js");
const authMiddleware_js_1 = require("../middlewares/authMiddleware.js");
const kycMiddleware_js_1 = require("../middlewares/kycMiddleware.js");
const router = express_1.default.Router();
/* =========================================================
   DEPOSIT FUNDS
   POST /api/funds/deposit

   Authentication required.
   KYC is not required for deposit for now.
========================================================= */
router.post("/deposit", authMiddleware_js_1.protect, fundsController_js_1.depositFunds);
/* =========================================================
   WITHDRAW FUNDS
   POST /api/funds/withdraw

   Authentication + verified KYC required.
========================================================= */
router.post("/withdraw", authMiddleware_js_1.protect, kycMiddleware_js_1.requireVerifiedKYC, fundsController_js_1.withdrawFunds);
exports.default = router;
