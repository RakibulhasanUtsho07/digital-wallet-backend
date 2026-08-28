"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const aiController_js_1 = require("../controllers/aiController.js");
const authMiddleware_js_1 = require("../middlewares/authMiddleware.js");
const router = express_1.default.Router();
router.get("/insights", authMiddleware_js_1.protect, aiController_js_1.getSpendingInsights);
router.get("/fraud-score", authMiddleware_js_1.protect, aiController_js_1.getFraudRiskScore);
exports.default = router;
