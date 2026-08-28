"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authController_js_1 = require("../controllers/authController.js");
const router = express_1.default.Router();
/* =========================================================
   REGISTER
   POST /api/auth/register
========================================================= */
router.post("/register", authController_js_1.registerUser);
/* =========================================================
   LOGIN
   POST /api/auth/login
========================================================= */
router.post("/login", authController_js_1.loginUser);
/* =========================================================
   LOGOUT
   POST /api/auth/logout
========================================================= */
router.post("/logout", authController_js_1.logoutUser);
exports.default = router;
