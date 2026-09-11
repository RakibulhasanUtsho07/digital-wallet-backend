"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const receiptController_js_1 = require("../controllers/receiptController.js");
const authMiddleware_js_1 = require("../middlewares/authMiddleware.js");
const router = express_1.default.Router();
/* =========================================================
   COLLECTION
========================================================= */
router.get("/", authMiddleware_js_1.protect, receiptController_js_1.getReceipts);
router.post("/", authMiddleware_js_1.protect, receiptController_js_1.addReceipt);
/* =========================================================
   SINGLE RECEIPT
========================================================= */
router.get("/:id", authMiddleware_js_1.protect, receiptController_js_1.getReceiptById);
router.patch("/:id", authMiddleware_js_1.protect, receiptController_js_1.updateReceipt);
router.delete("/:id", authMiddleware_js_1.protect, receiptController_js_1.deleteReceipt);
/* =========================================================
   RECEIPT ACTIONS
========================================================= */
router.patch("/:id/favorite", authMiddleware_js_1.protect, receiptController_js_1.toggleReceiptFavorite);
router.post("/:id/tags", authMiddleware_js_1.protect, receiptController_js_1.addReceiptTag);
exports.default = router;
