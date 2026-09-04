import express from "express";

import { createSupportTicket } from "../controllers/supportTicketController.js";
import { supportTicketRateLimiter } from "../middlewares/supportTicketRateLimiter.js";

const router = express.Router();

router.post("/", supportTicketRateLimiter, createSupportTicket);

export default router;
