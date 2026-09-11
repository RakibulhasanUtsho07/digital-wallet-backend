"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const transferController_js_1 = require("../controllers/transferController.js");
const authMiddleware_js_1 = require("../middlewares/authMiddleware.js");
const kycMiddleware_js_1 = require("../middlewares/kycMiddleware.js");
const router = express_1.default.Router();
/* =========================================================
   VALIDATE RECIPIENT
   POST /api/transfers/validate-recipient

   Authentication + verified KYC required.

   We also protect this endpoint because it can reveal
   recipient information and is part of the transfer flow.
========================================================= */
router.post("/validate-recipient", authMiddleware_js_1.protect, kycMiddleware_js_1.requireVerifiedKYC, transferController_js_1.validateRecipient);
/* =========================================================
   SEND MONEY
   POST /api/transfers

   Authentication + verified KYC required.
========================================================= */
router.post("/", authMiddleware_js_1.protect, kycMiddleware_js_1.requireVerifiedKYC, transferController_js_1.sendMoney);
exports.default = router;
