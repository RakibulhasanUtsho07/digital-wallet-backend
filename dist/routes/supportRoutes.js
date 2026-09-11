"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_js_1 = require("../middlewares/authMiddleware.js");
const adminAuthorization_js_1 = require("../middlewares/adminAuthorization.js");
const supportController_js_1 = require("../controllers/supportController.js");
const supportRateLimiters_js_1 = require("../middlewares/supportRateLimiters.js");
const router = express_1.default.Router();
router.use(authMiddleware_js_1.protect, adminAuthorization_js_1.requireAdmin);
router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
});
router.get("/overview", supportRateLimiters_js_1.supportReadLimiter, supportController_js_1.getSupportOverviewController);
router.get("/admins", supportRateLimiters_js_1.supportReadLimiter, supportController_js_1.getSupportAdminsController);
router.get("/export", supportRateLimiters_js_1.supportReadLimiter, supportController_js_1.exportSupportTicketsController);
router.get("/tickets", supportRateLimiters_js_1.supportReadLimiter, supportController_js_1.getSupportTicketsController);
router.post("/tickets", supportRateLimiters_js_1.supportCreateLimiter, supportController_js_1.createSupportTicketController);
router.get("/tickets/:id", supportRateLimiters_js_1.supportReadLimiter, supportController_js_1.getSupportTicketController);
router.patch("/tickets/:id", supportRateLimiters_js_1.supportWriteLimiter, supportController_js_1.updateSupportTicketController);
router.post("/tickets/:id/messages", supportRateLimiters_js_1.supportWriteLimiter, supportController_js_1.addSupportReplyController);
router.post("/tickets/:id/notes", supportRateLimiters_js_1.supportWriteLimiter, supportController_js_1.addSupportNoteController);
router.post("/tickets/:id/escalate", supportRateLimiters_js_1.supportWriteLimiter, supportController_js_1.escalateSupportTicketController);
router.post("/tickets/:id/resolve", supportRateLimiters_js_1.supportWriteLimiter, supportController_js_1.resolveSupportTicketController);
exports.default = router;
