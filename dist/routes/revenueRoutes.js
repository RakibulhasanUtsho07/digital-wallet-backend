"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_js_1 = require("../middlewares/authMiddleware.js");
const adminAuthorization_js_1 = require("../middlewares/adminAuthorization.js");
const revenueController_js_1 = require("../controllers/revenueController.js");
const revenueRateLimiters_js_1 = require("../middlewares/revenueRateLimiters.js");
const router = express_1.default.Router();
router.use(authMiddleware_js_1.protect, adminAuthorization_js_1.requireAdmin);
router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
});
router.get("/fee-policy", revenueRateLimiters_js_1.revenueReadLimiter, revenueController_js_1.getRevenueFeePolicy);
router.post("/simulate", revenueRateLimiters_js_1.revenueSimulationLimiter, revenueController_js_1.simulateRevenue);
router.get("/leakage", revenueRateLimiters_js_1.revenueReadLimiter, revenueController_js_1.getLeakage);
router.get("/contributors", revenueRateLimiters_js_1.revenueReadLimiter, revenueController_js_1.getContributors);
router.post("/leakage/investigate", revenueRateLimiters_js_1.revenueWriteLimiter, revenueController_js_1.investigateLeakage);
exports.default = router;
