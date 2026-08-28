"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auditController_js_1 = require("../controllers/auditController.js");
const authMiddleware_js_1 = require("../middlewares/authMiddleware.js");
const adminMiddleware_js_1 = require("../middlewares/adminMiddleware.js");
const router = express_1.default.Router();
// Route should be mounted under /api/admin/audit-logs
router.get("/", authMiddleware_js_1.protect, adminMiddleware_js_1.adminOnly, auditController_js_1.getAuditLogs);
exports.default = router;
