"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cashFlowController_js_1 = require("../controllers/cashFlowController.js");
const authMiddleware_js_1 = require("../middlewares/authMiddleware.js");
const router = express_1.default.Router();
router.get("/plans", authMiddleware_js_1.protect, cashFlowController_js_1.getCashFlowPlans);
router.post("/plans", authMiddleware_js_1.protect, cashFlowController_js_1.createCashFlowPlan);
router.delete("/plans/:id", authMiddleware_js_1.protect, cashFlowController_js_1.deleteCashFlowPlan);
exports.default = router;
