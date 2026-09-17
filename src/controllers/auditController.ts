import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddleware.js";
import { AuditLog } from "../models/AuditLog.js";

// @desc    Get system audit logs for monitoring
// @route   GET /api/admin/audit-logs
// @access  Private/Admin
export const getAuditLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    const logs = await AuditLog.find()
      .populate("actor", "name email role")
      .sort({ createdAt: -1 })
      .limit(limit);

    res.status(200).json({
      success: true,
      count: logs.length,
      logs,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};