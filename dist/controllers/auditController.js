"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuditLogs = void 0;
const AuditLog_js_1 = require("../models/AuditLog.js");
// @desc    Get system audit logs for monitoring
// @route   GET /api/admin/audit-logs
// @access  Private/Admin
const getAuditLogs = async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit) : 50;
        const logs = await AuditLog_js_1.AuditLog.find()
            .populate("actor", "name email role")
            .sort({ createdAt: -1 })
            .limit(limit);
        res.status(200).json({
            success: true,
            count: logs.length,
            logs,
        });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getAuditLogs = getAuditLogs;
