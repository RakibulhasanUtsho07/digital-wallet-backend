import express from "express";

import {
  addBudgetCategory,
  addBudgetExpense,
  addSavings,
  getBudgetDashboard,
  getBudgets,
  setBudget,
  updateBudgetCategory,
  updateBudgetSettings,
} from "../controllers/budgetController.js";

import {
  protect,
} from "../middlewares/authMiddleware.js";

const router =
  express.Router();

/* =========================================================
   COMPLETE DASHBOARD
========================================================= */

router.get(
  "/dashboard",
  protect,
  getBudgetDashboard
);

/* =========================================================
   SETTINGS + SAVINGS
========================================================= */

router.put(
  "/settings",
  protect,
  updateBudgetSettings
);

router.post(
  "/savings",
  protect,
  addSavings
);

/* =========================================================
   EXPENSES
========================================================= */

router.post(
  "/expenses",
  protect,
  addBudgetExpense
);

/* =========================================================
   CATEGORIES
========================================================= */

router.post(
  "/categories",
  protect,
  addBudgetCategory
);

router.patch(
  "/categories/:id",
  protect,
  updateBudgetCategory
);

/* =========================================================
   EXISTING / LEGACY-COMPATIBLE ROUTES
========================================================= */

router.post(
  "/",
  protect,
  setBudget
);

router.get(
  "/",
  protect,
  getBudgets
);

export default router;
