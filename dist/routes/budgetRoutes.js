"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const budgetController_js_1 = require("../controllers/budgetController.js");
const authMiddleware_js_1 = require("../middlewares/authMiddleware.js");
const router = express_1.default.Router();
/* =========================================================
   COMPLETE DASHBOARD
========================================================= */
router.get("/dashboard", authMiddleware_js_1.protect, budgetController_js_1.getBudgetDashboard);
/* =========================================================
   SETTINGS + SAVINGS
========================================================= */
router.put("/settings", authMiddleware_js_1.protect, budgetController_js_1.updateBudgetSettings);
router.post("/savings", authMiddleware_js_1.protect, budgetController_js_1.addSavings);
/* =========================================================
   EXPENSES
========================================================= */
router.post("/expenses", authMiddleware_js_1.protect, budgetController_js_1.addBudgetExpense);
/* =========================================================
   CATEGORIES
========================================================= */
router.post("/categories", authMiddleware_js_1.protect, budgetController_js_1.addBudgetCategory);
router.patch("/categories/:id", authMiddleware_js_1.protect, budgetController_js_1.updateBudgetCategory);
/* =========================================================
   EXISTING / LEGACY-COMPATIBLE ROUTES
========================================================= */
router.post("/", authMiddleware_js_1.protect, budgetController_js_1.setBudget);
router.get("/", authMiddleware_js_1.protect, budgetController_js_1.getBudgets);
exports.default = router;
