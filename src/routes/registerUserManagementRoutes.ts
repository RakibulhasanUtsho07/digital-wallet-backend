import type { Express } from "express";
import currentUserRoutes from "./currentUserRoutes";
import userManagementRoutes from "./userManagementRoutes";

/**
 * Call this once from src/app.ts after express.json()/cookie/CORS middleware
 * and before the global 404 + error handlers.
 */
export function registerUserManagementRoutes(app: Express) {
  app.use("/api/auth", currentUserRoutes);
  app.use("/api/admin/users", userManagementRoutes);
}
