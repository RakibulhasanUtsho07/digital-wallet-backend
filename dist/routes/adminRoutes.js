"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const adminController_js_1 = require("../controllers/adminController.js");
const authMiddleware_js_1 = require("../middlewares/authMiddleware.js");
const adminMiddleware_js_1 = require("../middlewares/adminMiddleware.js");
const router = express_1.default.Router();
/* =========================================================
   ADMIN OVERVIEW
   GET /api/admin/overview?period=30d
========================================================= */
router.get("/overview", authMiddleware_js_1.protect, adminMiddleware_js_1.adminOnly, adminController_js_1.getAdminOverview);
/* =========================================================
   USERS
   GET /api/admin/users
========================================================= */
router.get("/users", authMiddleware_js_1.protect, adminMiddleware_js_1.adminOnly, adminController_js_1.getAllUsers);
/* =========================================================
   KYC
========================================================= */
router.get("/kyc/pending", authMiddleware_js_1.protect, adminMiddleware_js_1.adminOnly, adminController_js_1.getPendingKYCs);
router.patch("/kyc/:id/review", authMiddleware_js_1.protect, adminMiddleware_js_1.adminOnly, adminController_js_1.reviewKYC);
exports.default = router;
