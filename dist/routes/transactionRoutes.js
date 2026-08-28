"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const transactionController_js_1 = require("../controllers/transactionController.js");
const authMiddleware_js_1 = require("../middlewares/authMiddleware.js");
const router = express_1.default.Router();
router.get("/", authMiddleware_js_1.protect, transactionController_js_1.getMyTransactions);
router.get("/:id", authMiddleware_js_1.protect, transactionController_js_1.getTransactionById);
exports.default = router;
