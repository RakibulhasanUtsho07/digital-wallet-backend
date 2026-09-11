"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.protect = void 0;
const User_js_1 = require("../models/User.js");
const AuthSession_js_1 = require("../models/AuthSession.js");
const authSessionService_js_1 = require("../services/authSessionService.js");
/* =========================================================
   CONSTANTS
========================================================= */
/*
 * Avoid updating lastActiveAt on every API request.
 * A session activity update is performed at most once
 * every 5 minutes.
 */
const SESSION_ACTIVITY_REFRESH_MS = 5 * 60 * 1000;
/* =========================================================
   PROTECT
========================================================= */
const protect = async (req, res, next) => {
    try {
        /* ===================================================
           READ TOKEN
        ==================================================== */
        const token = (0, authSessionService_js_1.readTokenFromRequest)(req);
        if (!token) {
            res.status(401).json({
                success: false,
                message: "Not authorized, no token provided",
            });
            return;
        }
        /* ===================================================
           VERIFY JWT
        ==================================================== */
        const decoded = (0, authSessionService_js_1.decodeSessionToken)(token);
        if (!decoded ||
            !decoded.id) {
            res.status(401).json({
                success: false,
                message: "Not authorized, invalid token",
            });
            return;
        }
        /* ===================================================
           LOAD USER
        ==================================================== */
        const foundUser = await User_js_1.User.findById(decoded.id)
            .select("role authVersion accountStatus")
            .lean();
        if (!foundUser) {
            res.status(401).json({
                success: false,
                message: "Not authorized, user not found",
            });
            return;
        }
        /* ===================================================
           ACCOUNT STATUS
        ==================================================== */
        if (foundUser.accountStatus ===
            "deleted") {
            res.status(401).json({
                success: false,
                message: "This account is no longer active.",
            });
            return;
        }
        /* ===================================================
           AUTH VERSION
        ==================================================== */
        const tokenVersion = Number(decoded.authVersion ?? 0);
        const userVersion = Number(foundUser.authVersion ?? 0);
        /*
         * authVersion is incremented when:
         * - password is reset
         * - sessions are globally revoked
         * - other security events require JWT invalidation
         */
        if (!Number.isInteger(tokenVersion) ||
            tokenVersion < 0 ||
            !Number.isInteger(userVersion) ||
            userVersion < 0 ||
            tokenVersion !==
                userVersion) {
            res.status(401).json({
                success: false,
                code: "AUTH_VERSION_MISMATCH",
                message: "Session has been revoked. Please sign in again.",
            });
            return;
        }
        /* ===================================================
           SERVER-SIDE SESSION VALIDATION
        ==================================================== */
        /*
         * New security-enabled JWTs always contain `sid`.
         *
         * The sid connects:
         *
         * Browser
         *   ↓
         * JWT
         *   ↓
         * AuthSession
         *
         * This makes individual device/session revocation
         * possible without revoking every session.
         */
        let activeSession = null;
        if (decoded.sid) {
            activeSession =
                await AuthSession_js_1.AuthSession.findOne({
                    userId: foundUser._id,
                    sessionId: decoded.sid,
                    revokedAt: {
                        $exists: false,
                    },
                    expiresAt: {
                        $gt: new Date(),
                    },
                })
                    .select("_id lastActiveAt")
                    .lean();
            if (!activeSession) {
                res.status(401).json({
                    success: false,
                    code: "SESSION_REVOKED_OR_EXPIRED",
                    message: "Session is no longer active. Please sign in again.",
                });
                return;
            }
            /* =================================================
               REFRESH SESSION ACTIVITY
            ================================================== */
            const lastActiveTime = activeSession.lastActiveAt
                instanceof Date
                ? activeSession.lastActiveAt.getTime()
                : 0;
            const sessionActivityAge = Date.now() -
                lastActiveTime;
            if (sessionActivityAge >=
                SESSION_ACTIVITY_REFRESH_MS) {
                /*
                 * Update conditionally so a revoked/expired
                 * session cannot accidentally be refreshed.
                 */
                await AuthSession_js_1.AuthSession.updateOne({
                    _id: activeSession._id,
                    userId: foundUser._id,
                    sessionId: decoded.sid,
                    revokedAt: {
                        $exists: false,
                    },
                    expiresAt: {
                        $gt: new Date(),
                    },
                }, {
                    $set: {
                        lastActiveAt: new Date(),
                    },
                });
            }
        }
        /* ===================================================
           ATTACH AUTH CONTEXT
        ==================================================== */
        req.user = {
            _id: foundUser._id.toString(),
            role: foundUser.role,
            /*
             * Important:
             * This comes from the verified JWT.
             *
             * Security Center can now use:
             * req.user.sessionId
             */
            sessionId: decoded.sid,
            tokenIssuedAt: decoded.iat,
        };
        /* ===================================================
           CONTINUE
        ==================================================== */
        next();
    }
    catch (error) {
        /*
         * Never expose internal JWT, database,
         * crypto, or authentication implementation details.
         */
        console.error("AUTH MIDDLEWARE ERROR:", error instanceof Error
            ? error.message
            : error);
        if (res.headersSent) {
            return;
        }
        res.status(401).json({
            success: false,
            message: "Not authorized, token failed",
        });
    }
};
exports.protect = protect;
