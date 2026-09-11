"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const supportTicketController_js_1 = require("../controllers/supportTicketController.js");
const supportTicketRateLimiter_js_1 = require("../middlewares/supportTicketRateLimiter.js");
const router = express_1.default.Router();
router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
});
router.post("/", supportTicketRateLimiter_js_1.supportTicketRateLimiter, supportTicketController_js_1.createSupportTicket);
exports.default = router;
