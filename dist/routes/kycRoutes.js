"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const kycController_js_1 = require("../controllers/kycController.js");
const authMiddleware_js_1 = require("../middlewares/authMiddleware.js");
const kycUploadMiddleware_js_1 = require("../middlewares/kycUploadMiddleware.js");
const router = express_1.default.Router();
/* =========================================================
   GET KYC STATUS
========================================================= */
router.get("/status", authMiddleware_js_1.protect, kycController_js_1.getKYCStatus);
/* =========================================================
   START KYC
========================================================= */
router.post("/start", authMiddleware_js_1.protect, kycController_js_1.startKYC);
/* =========================================================
   SUBMIT KYC
========================================================= */
router.put("/submit", authMiddleware_js_1.protect, kycUploadMiddleware_js_1.kycUpload.fields([
    {
        name: "frontImage",
        maxCount: 1,
    },
    {
        name: "backImage",
        maxCount: 1,
    },
    {
        name: "selfieImage",
        maxCount: 1,
    },
]), kycController_js_1.submitKYC);
exports.default = router;
