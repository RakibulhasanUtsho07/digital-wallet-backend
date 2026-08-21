import express from "express";
import { getAuditLogs } from "../controllers/auditController.js";
import { protect } from "../middlewares/authMiddleware.js";
import { adminOnly } from "../middlewares/adminMiddleware.js";

const router = express.Router();

// Route should be mounted under /api/admin/audit-logs
router.get("/", protect, adminOnly, getAuditLogs);

export default router;