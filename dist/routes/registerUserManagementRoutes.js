"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerUserManagementRoutes = registerUserManagementRoutes;
const currentUserRoutes_1 = __importDefault(require("./currentUserRoutes"));
const userManagementRoutes_1 = __importDefault(require("./userManagementRoutes"));
/**
 * Call this once from src/app.ts after express.json()/cookie/CORS middleware
 * and before the global 404 + error handlers.
 */
function registerUserManagementRoutes(app) {
    app.use("/api/auth", currentUserRoutes_1.default);
    app.use("/api/admin/users", userManagementRoutes_1.default);
}
