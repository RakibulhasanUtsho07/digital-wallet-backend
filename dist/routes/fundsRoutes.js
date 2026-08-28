"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const fundsController_js_1 = require("../controllers/fundsController.js");
const authMiddleware_js_1 = require("../middlewares/authMiddleware.js");
const router = express_1.default.Router();
router.post("/deposit", authMiddleware_js_1.protect, fundsController_js_1.depositFunds);
router.post("/withdraw", authMiddleware_js_1.protect, fundsController_js_1.withdrawFunds);
exports.default = router;
