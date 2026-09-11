"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_js_1 = require("../middlewares/authMiddleware.js");
const adminAuthorization_js_1 = require("../middlewares/adminAuthorization.js");
const kycAIRateLimiters_js_1 = require("../middlewares/kycAIRateLimiters.js");
const kycOverviewController_js_1 = require("../controllers/kycOverviewController.js");
const kycAIReviewController_js_1 = require("../controllers/kycAIReviewController.js");
const router = express_1.default.Router();
router.use(authMiddleware_js_1.protect, adminAuthorization_js_1.requireAdmin);
router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
});
router.get("/overview", kycAIRateLimiters_js_1.kycAIReadLimiter, kycOverviewController_js_1.getAdminKycOverviewController);
router.get("/:id/ai-review", kycAIRateLimiters_js_1.kycAIReadLimiter, kycAIReviewController_js_1.getKycAiReviewController);
router.post("/:id/ai-review", kycAIRateLimiters_js_1.kycAIRunLimiter, kycAIReviewController_js_1.runKycAiReviewController);
exports.default = router;
