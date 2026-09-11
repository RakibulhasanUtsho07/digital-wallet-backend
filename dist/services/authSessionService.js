"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.revokeCurrentSessionFromRequest = exports.getSessionIdFromRequest = exports.decodeSessionToken = exports.readTokenFromRequest = exports.findActiveSession = exports.revokeSessionById = exports.revokeAllOtherSessions = exports.revokeAllSessions = exports.issueAuthenticatedSession = exports.createSessionToken = exports.clearAuthCookie = exports.AUTH_SESSION_MAX_AGE_MS = exports.AUTH_SESSION_DAYS = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const AuthSession_js_1 = require("../models/AuthSession.js");
const securityRequestMetadata_js_1 = require("./securityRequestMetadata.js");
/* =========================================================
   CONSTANTS
========================================================= */
exports.AUTH_SESSION_DAYS = 30;
exports.AUTH_SESSION_MAX_AGE_MS = exports.AUTH_SESSION_DAYS *
    24 *
    60 *
    60 *
    1000;
const AUTH_COOKIE_NAME = "access_token";
const JWT_ALGORITHM = "HS256";
const VALID_USER_ROLES = new Set([
    "user",
    "support",
    "analyst",
    "admin",
]);
/* =========================================================
   TYPE VALIDATION
========================================================= */
function isUserRole(value) {
    return (typeof value ===
        "string" &&
        VALID_USER_ROLES.has(value));
}
function isValidUserId(value) {
    return (typeof value ===
        "string" &&
        /^[a-f\d]{24}$/i.test(value));
}
function isValidSessionId(value) {
    return (typeof value ===
        "string" &&
        /^[a-f\d]{48}$/i.test(value));
}
/* =========================================================
   ENVIRONMENT
========================================================= */
const isProductionEnvironment = () => {
    return (process.env.NODE_ENV ===
        "production" ||
        process.env.VERCEL ===
            "1");
};
/* =========================================================
   COOKIE
========================================================= */
const getCookieOptions = () => {
    const isProduction = isProductionEnvironment();
    return {
        httpOnly: true,
        secure: isProduction,
        /*
         * Different frontend/backend origins in production
         * require SameSite=None.
         */
        sameSite: isProduction
            ? "none"
            : "lax",
        path: "/",
        maxAge: exports.AUTH_SESSION_MAX_AGE_MS,
    };
};
/* =========================================================
   CLEAR AUTH COOKIE
========================================================= */
const clearAuthCookie = (res) => {
    const options = getCookieOptions();
    /*
     * Express clearCookie does not need maxAge.
     */
    const { maxAge: _maxAge, ...clearOptions } = options;
    res.clearCookie(AUTH_COOKIE_NAME, clearOptions);
};
exports.clearAuthCookie = clearAuthCookie;
/* =========================================================
   JWT SECRET
========================================================= */
const getJwtSecret = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret ||
        secret.length < 32) {
        throw new Error("JWT_SECRET must contain at least 32 characters.");
    }
    return secret;
};
/* =========================================================
   GENERATE SESSION ID
========================================================= */
const generateSessionId = () => {
    /*
     * 24 random bytes
     * = 48 hex characters
     */
    return node_crypto_1.default
        .randomBytes(24)
        .toString("hex");
};
/* =========================================================
   CREATE SESSION TOKEN
========================================================= */
const createSessionToken = ({ userId, role, authVersion, sessionId, }) => {
    /* =====================================================
       USER ID
    ====================================================== */
    if (!isValidUserId(userId)) {
        throw new Error("Cannot create session token for an invalid user ID.");
    }
    /* =====================================================
       ROLE
    ====================================================== */
    if (!isUserRole(role)) {
        throw new Error("Cannot create session token with an invalid user role.");
    }
    /* =====================================================
       AUTH VERSION
    ====================================================== */
    if (!Number.isInteger(authVersion) ||
        authVersion < 0) {
        throw new Error("Cannot create session token with an invalid authentication version.");
    }
    /* =====================================================
       SESSION ID
    ====================================================== */
    const normalizedSessionId = sessionId.trim();
    if (!isValidSessionId(normalizedSessionId)) {
        throw new Error("Cannot create session token with an invalid session ID.");
    }
    /* =====================================================
       JWT
    ====================================================== */
    return jsonwebtoken_1.default.sign({
        id: userId,
        role,
        authVersion,
        sid: normalizedSessionId,
    }, getJwtSecret(), {
        algorithm: JWT_ALGORITHM,
        expiresIn: exports.AUTH_SESSION_DAYS *
            24 *
            60 *
            60,
    });
};
exports.createSessionToken = createSessionToken;
/* =========================================================
   ISSUE AUTHENTICATED SESSION
========================================================= */
const issueAuthenticatedSession = async ({ user, req, res, }) => {
    /* =====================================================
       USER ID
    ====================================================== */
    const userId = user._id
        .toString()
        .trim();
    if (!isValidUserId(userId)) {
        throw new Error("Cannot create an authentication session for an invalid user.");
    }
    /* =====================================================
       ROLE
    ====================================================== */
    if (!isUserRole(user.role)) {
        throw new Error("Cannot create an authentication session for an invalid role.");
    }
    /* =====================================================
       REQUEST METADATA
    ====================================================== */
    const metadata = (0, securityRequestMetadata_js_1.getSecurityRequestMetadata)(req);
    /* =====================================================
       SESSION ID
    ====================================================== */
    const sessionId = generateSessionId();
    /* =====================================================
       EXPIRATION
    ====================================================== */
    const now = new Date();
    const expiresAt = new Date(now.getTime() +
        exports.AUTH_SESSION_MAX_AGE_MS);
    /* =====================================================
       DATABASE SESSION
    ====================================================== */
    await AuthSession_js_1.AuthSession.create({
        userId,
        sessionId,
        ...metadata,
        lastActiveAt: now,
        expiresAt,
    });
    /* =====================================================
       JWT
    ====================================================== */
    const token = (0, exports.createSessionToken)({
        userId,
        role: user.role,
        authVersion: user.authVersion ??
            0,
        sessionId,
    });
    /* =====================================================
       AUTH COOKIE
    ====================================================== */
    res.cookie(AUTH_COOKIE_NAME, token, getCookieOptions());
    return {
        sessionId,
        token,
    };
};
exports.issueAuthenticatedSession = issueAuthenticatedSession;
/* =========================================================
   REVOKE ALL SESSIONS
========================================================= */
const revokeAllSessions = async (userId) => {
    if (!isValidUserId(userId)) {
        return 0;
    }
    const result = await AuthSession_js_1.AuthSession.updateMany({
        userId,
        revokedAt: {
            $exists: false,
        },
    }, {
        $set: {
            revokedAt: new Date(),
        },
    });
    return (result.modifiedCount ??
        0);
};
exports.revokeAllSessions = revokeAllSessions;
/* =========================================================
   REVOKE ALL OTHER SESSIONS
========================================================= */
const revokeAllOtherSessions = async ({ userId, currentSessionId, }) => {
    if (!isValidUserId(userId) ||
        !isValidSessionId(currentSessionId)) {
        return 0;
    }
    const result = await AuthSession_js_1.AuthSession.updateMany({
        userId,
        sessionId: {
            $ne: currentSessionId,
        },
        revokedAt: {
            $exists: false,
        },
        expiresAt: {
            $gt: new Date(),
        },
    }, {
        $set: {
            revokedAt: new Date(),
        },
    });
    return (result.modifiedCount ??
        0);
};
exports.revokeAllOtherSessions = revokeAllOtherSessions;
/* =========================================================
   REVOKE ONE SESSION
========================================================= */
const revokeSessionById = async ({ userId, sessionId, }) => {
    if (!isValidUserId(userId) ||
        !isValidSessionId(sessionId)) {
        return false;
    }
    const result = await AuthSession_js_1.AuthSession.updateOne({
        userId,
        sessionId,
        revokedAt: {
            $exists: false,
        },
        expiresAt: {
            $gt: new Date(),
        },
    }, {
        $set: {
            revokedAt: new Date(),
        },
    });
    return ((result.modifiedCount ??
        0) > 0);
};
exports.revokeSessionById = revokeSessionById;
/* =========================================================
   FIND ONE ACTIVE SESSION
========================================================= */
const findActiveSession = async ({ userId, sessionId, }) => {
    if (!isValidUserId(userId) ||
        !isValidSessionId(sessionId)) {
        return null;
    }
    return AuthSession_js_1.AuthSession.findOne({
        userId,
        sessionId,
        revokedAt: {
            $exists: false,
        },
        expiresAt: {
            $gt: new Date(),
        },
    })
        .lean();
};
exports.findActiveSession = findActiveSession;
/* =========================================================
   READ TOKEN FROM REQUEST
========================================================= */
const readTokenFromRequest = (req) => {
    /* =====================================================
       AUTHORIZATION HEADER
    ====================================================== */
    const authorization = req.headers.authorization;
    if (typeof authorization ===
        "string") {
        const match = authorization.match(/^Bearer\s+(.+)$/i);
        const bearerToken = match?.[1]?.trim();
        if (bearerToken) {
            return bearerToken;
        }
    }
    /* =====================================================
       COOKIE
    ====================================================== */
    const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
    if (typeof cookieToken ===
        "string" &&
        cookieToken.trim()) {
        return cookieToken.trim();
    }
    return undefined;
};
exports.readTokenFromRequest = readTokenFromRequest;
/* =========================================================
   DECODE AND VALIDATE TOKEN
========================================================= */
const decodeSessionToken = (token) => {
    if (typeof token !==
        "string" ||
        !token.trim()) {
        throw new Error("Authentication token is required.");
    }
    /* =====================================================
       JWT VERIFY
    ====================================================== */
    const decoded = jsonwebtoken_1.default.verify(token, getJwtSecret(), {
        algorithms: [
            JWT_ALGORITHM,
        ],
    });
    if (typeof decoded ===
        "string" ||
        !decoded ||
        typeof decoded !==
            "object") {
        throw new Error("Invalid authentication token payload.");
    }
    /* =====================================================
       USER ID
    ====================================================== */
    if (!isValidUserId(decoded.id)) {
        throw new Error("Authentication token contains an invalid user ID.");
    }
    /* =====================================================
       ROLE
    ====================================================== */
    if (!isUserRole(decoded.role)) {
        throw new Error("Authentication token contains an invalid user role.");
    }
    /* =====================================================
       AUTH VERSION
    ====================================================== */
    if (typeof decoded.authVersion !==
        "number" ||
        !Number.isInteger(decoded.authVersion) ||
        decoded.authVersion < 0) {
        throw new Error("Authentication token contains an invalid authentication version.");
    }
    /* =====================================================
       SESSION ID
    ====================================================== */
    if (decoded.sid !==
        undefined) {
        if (!isValidSessionId(decoded.sid)) {
            throw new Error("Authentication token contains an invalid session ID.");
        }
    }
    /* =====================================================
       BASE PAYLOAD
    ====================================================== */
    const payload = {
        id: decoded.id,
        role: decoded.role,
        authVersion: decoded.authVersion,
    };
    /* =====================================================
       OPTIONAL SID
    ====================================================== */
    if (typeof decoded.sid ===
        "string") {
        payload.sid =
            decoded.sid;
    }
    /* =====================================================
       OPTIONAL IAT
    ====================================================== */
    if (typeof decoded.iat ===
        "number") {
        payload.iat =
            decoded.iat;
    }
    /* =====================================================
       OPTIONAL EXP
    ====================================================== */
    if (typeof decoded.exp ===
        "number") {
        payload.exp =
            decoded.exp;
    }
    return payload;
};
exports.decodeSessionToken = decodeSessionToken;
/* =========================================================
   GET SESSION ID FROM REQUEST
========================================================= */
const getSessionIdFromRequest = (req) => {
    const token = (0, exports.readTokenFromRequest)(req);
    if (!token) {
        return null;
    }
    try {
        const decoded = (0, exports.decodeSessionToken)(token);
        return (decoded.sid ??
            null);
    }
    catch {
        return null;
    }
};
exports.getSessionIdFromRequest = getSessionIdFromRequest;
/* =========================================================
   REVOKE CURRENT SESSION
========================================================= */
const revokeCurrentSessionFromRequest = async (req) => {
    const token = (0, exports.readTokenFromRequest)(req);
    if (!token) {
        return;
    }
    try {
        const decoded = (0, exports.decodeSessionToken)(token);
        if (decoded.id &&
            decoded.sid) {
            await (0, exports.revokeSessionById)({
                userId: decoded.id,
                sessionId: decoded.sid,
            });
        }
    }
    catch {
        /*
         * Logout should always remain successful from the
         * client perspective even when the token is expired,
         * malformed, already revoked, etc.
         */
    }
};
exports.revokeCurrentSessionFromRequest = revokeCurrentSessionFromRequest;
