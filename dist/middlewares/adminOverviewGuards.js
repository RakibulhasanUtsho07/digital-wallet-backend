"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdministrator = exports.requireAuthentication = void 0;
const AuthModule = __importStar(require("./authMiddleware.js"));
const AdminModule = __importStar(require("./adminMiddleware.js"));
const AdminAuthorizationModule = __importStar(require("./adminAuthorization.js"));
function findMiddleware(moduleValue, names) {
    for (const name of names) {
        const candidate = moduleValue[name];
        if (typeof candidate === "function")
            return candidate;
    }
    return undefined;
}
function requiredMiddleware(candidate, errorMessage) {
    if (!candidate)
        throw new Error(errorMessage);
    return candidate;
}
exports.requireAuthentication = requiredMiddleware(findMiddleware(AuthModule, [
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
]), "No authentication middleware export was found in authMiddleware.ts");
exports.requireAdministrator = requiredMiddleware(findMiddleware(AdminModule, [
    "adminMiddleware",
    "requireAdmin",
    "adminOnly",
    "isAdmin",
    "verifyAdmin",
    "checkAdmin",
    "default",
]) ??
    findMiddleware(AdminAuthorizationModule, [
        "adminAuthorization",
        "authorizeAdmin",
        "requireAdmin",
        "adminOnly",
        "isAdmin",
        "verifyAdmin",
        "checkAdmin",
        "default",
    ]), "No admin middleware export was found in adminMiddleware.ts or adminAuthorization.ts");
