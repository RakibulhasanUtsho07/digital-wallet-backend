import type { RequestHandler } from "express";
import * as AuthModule from "./authMiddleware.js";
import * as AdminModule from "./adminMiddleware.js";
import * as AdminAuthorizationModule from "./adminAuthorization.js";

type MiddlewareModule = Record<string, unknown>;

function findMiddleware(
  moduleValue: MiddlewareModule,
  names: string[]
): RequestHandler | undefined {
  for (const name of names) {
    const candidate = moduleValue[name];
    if (typeof candidate === "function") return candidate as RequestHandler;
  }
  return undefined;
}

function requiredMiddleware(
  candidate: RequestHandler | undefined,
  errorMessage: string
): RequestHandler {
  if (!candidate) throw new Error(errorMessage);
  return candidate;
}

export const requireAuthentication = requiredMiddleware(
  findMiddleware(AuthModule as MiddlewareModule, [
    "authMiddleware",
    "authenticate",
    "authenticateUser",
    "authenticateToken",
    "requireAuth",
    "isAuthenticated",
    "protect",
    "verifyToken",
    "verifyJWT",
    "default",
  ]),
  "No authentication middleware export was found in authMiddleware.ts"
);

export const requireAdministrator = requiredMiddleware(
  findMiddleware(AdminModule as MiddlewareModule, [
    "adminMiddleware",
    "requireAdmin",
    "adminOnly",
    "isAdmin",
    "verifyAdmin",
    "checkAdmin",
    "default",
  ]) ??
    findMiddleware(AdminAuthorizationModule as MiddlewareModule, [
      "adminAuthorization",
      "authorizeAdmin",
      "requireAdmin",
      "adminOnly",
      "isAdmin",
      "verifyAdmin",
      "checkAdmin",
      "default",
    ]),
  "No admin middleware export was found in adminMiddleware.ts or adminAuthorization.ts"
);