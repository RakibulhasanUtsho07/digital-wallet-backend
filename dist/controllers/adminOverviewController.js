"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminOverview = adminOverview;
exports.exportAdminOverview = exportAdminOverview;
const zod_1 = require("zod");
const adminOverviewService_js_1 = require("../services/adminOverviewService.js");
const adminOverviewValidation_js_1 = require("../validators/adminOverviewValidation.js");
async function adminOverview(req, res, next) {
    try {
        const { range } = adminOverviewValidation_js_1.adminOverviewQuerySchema.parse(req.query);
        const data = await (0, adminOverviewService_js_1.getAdminOverview)(range);
        res.setHeader("Cache-Control", "private, no-store");
        res.status(200).json(data);
    }
    catch (error) {
        handleError(error, res, next);
    }
}
async function exportAdminOverview(req, res, next) {
    try {
        const { range } = adminOverviewValidation_js_1.adminOverviewQuerySchema.parse(req.query);
        const data = await (0, adminOverviewService_js_1.getAdminOverview)(range);
        await (0, adminOverviewService_js_1.recordOverviewExport)(getActorId(req), range);
        res.setHeader("Cache-Control", "private, no-store");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="admin-overview-${range}-${new Date().toISOString().slice(0, 10)}.csv"`);
        res.status(200).send((0, adminOverviewService_js_1.overviewToCsv)(data));
    }
    catch (error) {
        handleError(error, res, next);
    }
}
function getActorId(req) {
    const value = req.user?._id ?? req.user?.id ?? req.user?.userId ?? req.user?.sub;
    return value === undefined || value === null ? undefined : String(value);
}
function handleError(error, res, next) {
    if (error instanceof zod_1.z.ZodError) {
        res.status(400).json({
            success: false,
            message: "Invalid overview range.",
            issues: error.issues,
        });
        return;
    }
    next(error);
}
