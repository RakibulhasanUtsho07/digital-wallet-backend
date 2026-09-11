"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminOverviewQuerySchema = void 0;
const zod_1 = require("zod");
exports.adminOverviewQuerySchema = zod_1.z.object({
    range: zod_1.z.enum(["7d", "30d", "90d", "1y"]).default("30d"),
}).strict();
