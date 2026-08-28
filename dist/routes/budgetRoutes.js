"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const budgetController_js_1 = require("../controllers/budgetController.js");
const authMiddleware_js_1 = require("../middlewares/authMiddleware.js");
const router = express_1.default.Router();
router.post("/", authMiddleware_js_1.protect, budgetController_js_1.setBudget);
router.get("/", authMiddleware_js_1.protect, budgetController_js_1.getBudgets);
exports.default = router;
