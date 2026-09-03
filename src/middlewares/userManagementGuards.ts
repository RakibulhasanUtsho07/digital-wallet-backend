import type { RequestHandler } from "express";
import * as AuthModule from "./authMiddleware";
import * as AdminModule from "./adminMiddleware";
import * as AdminAuthorizationModule from "./adminAuthorization";

type MiddlewareModule = Record<string, unknown>;

function resolveMiddleware(moduleValue: MiddlewareModule, names: string[]): RequestHandler | null {
  for (const name of names) {
    const candidate = moduleValue[name];
    if (typeof candidate === "function") return candidate as RequestHandler;
  }
  return null;
}

export const requireAuthentication = resolveMiddleware(AuthModule as MiddlewareModule, [
  "authMiddleware", "authenticate", "authenticateUser", "authenticateToken", "requireAuth",
  "isAuthenticated", "protect", "verifyToken", "verifyJWT", "default",
]);

export const requireAdministrator =
  resolveMiddleware(AdminModule as MiddlewareModule, [
    "adminMiddleware", "requireAdmin", "adminOnly", "isAdmin", "verifyAdmin", "checkAdmin", "default",
  ])
  ?? resolveMiddleware(AdminAuthorizationModule as MiddlewareModule, [
    "adminAuthorization", "authorizeAdmin", "requireAdmin", "isAdmin", "verifyAdmin", "checkAdmin", "default",
  ]);

if (!requireAuthentication) {
  throw new Error("No authentication middleware export was found in authMiddleware.ts");
}

if (!requireAdministrator) {
  throw new Error("No admin middleware export was found in adminMiddleware.ts or adminAuthorization.ts");
}
