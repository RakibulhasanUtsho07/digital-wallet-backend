import crypto from "node:crypto";

import jwt from "jsonwebtoken";

import type {
  Request,
  Response,
  CookieOptions,
} from "express";

import type {
  UserRole,
} from "../models/User.js";

import {
  AuthSession,
} from "../models/AuthSession.js";

import {
  getSecurityRequestMetadata,
} from "./securityRequestMetadata.js";

/* =========================================================
   CONSTANTS
========================================================= */

export const AUTH_SESSION_DAYS =
  30;

export const AUTH_SESSION_MAX_AGE_MS =
  AUTH_SESSION_DAYS *
  24 *
  60 *
  60 *
  1000;

const AUTH_COOKIE_NAME =
  "access_token";

const JWT_ALGORITHM =
  "HS256" as const;

const VALID_USER_ROLES:
  ReadonlySet<string> =
  new Set([
    "user",
    "support",
    "analyst",
    "admin",
  ]);

/* =========================================================
   TYPES
========================================================= */

export interface SessionTokenPayload {
  id: string;

  role: UserRole;

  authVersion: number;

  /*
   * Session identifier.
   *
   * Present on all newly issued authentication tokens.
   */
  sid?: string;

  iat?: number;

  exp?: number;
}

interface SessionUserInput {
  _id: {
    toString(): string;
  };

  role: UserRole;

  authVersion?: number;
}

/* =========================================================
   TYPE VALIDATION
========================================================= */

function isUserRole(
  value: unknown
): value is UserRole {
  return (
    typeof value ===
      "string" &&
    VALID_USER_ROLES.has(
      value
    )
  );
}

function isValidUserId(
  value: unknown
): value is string {
  return (
    typeof value ===
      "string" &&
    /^[a-f\d]{24}$/i.test(
      value
    )
  );
}

function isValidSessionId(
  value: unknown
): value is string {
  return (
    typeof value ===
      "string" &&
    /^[a-f\d]{48}$/i.test(
      value
    )
  );
}

/* =========================================================
   ENVIRONMENT
========================================================= */

const isProductionEnvironment =
  (): boolean => {
    return (
      process.env.NODE_ENV ===
        "production" ||
      process.env.VERCEL ===
        "1"
    );
  };

/* =========================================================
   COOKIE
========================================================= */

const getCookieOptions =
  (): CookieOptions => {
    const isProduction =
      isProductionEnvironment();

    return {
      httpOnly:
        true,

      secure:
        isProduction,

      /*
       * Different frontend/backend origins in production
       * require SameSite=None.
       */
      sameSite:
        isProduction
          ? "none"
          : "lax",

      path: "/",

      maxAge:
        AUTH_SESSION_MAX_AGE_MS,
    };
  };

/* =========================================================
   CLEAR AUTH COOKIE
========================================================= */

export const clearAuthCookie = (
  res: Response
): void => {
  const options =
    getCookieOptions();

  /*
   * Express clearCookie does not need maxAge.
   */
  const {
    maxAge: _maxAge,
    ...clearOptions
  } = options;

  res.clearCookie(
    AUTH_COOKIE_NAME,
    clearOptions
  );
};

/* =========================================================
   JWT SECRET
========================================================= */

const getJwtSecret =
  (): string => {
    const secret =
      process.env.JWT_SECRET;

    if (
      !secret ||
      secret.length < 32
    ) {
      throw new Error(
        "JWT_SECRET must contain at least 32 characters."
      );
    }

    return secret;
  };

/* =========================================================
   GENERATE SESSION ID
========================================================= */

const generateSessionId =
  (): string => {
    /*
     * 24 random bytes
     * = 48 hex characters
     */
    return crypto
      .randomBytes(24)
      .toString("hex");
  };

/* =========================================================
   CREATE SESSION TOKEN
========================================================= */

export const createSessionToken =
  ({
    userId,
    role,
    authVersion,
    sessionId,
  }: {
    userId: string;
    role: UserRole;
    authVersion: number;
    sessionId: string;
  }): string => {
    /* =====================================================
       USER ID
    ====================================================== */

    if (
      !isValidUserId(
        userId
      )
    ) {
      throw new Error(
        "Cannot create session token for an invalid user ID."
      );
    }

    /* =====================================================
       ROLE
    ====================================================== */

    if (
      !isUserRole(
        role
      )
    ) {
      throw new Error(
        "Cannot create session token with an invalid user role."
      );
    }

    /* =====================================================
       AUTH VERSION
    ====================================================== */

    if (
      !Number.isInteger(
        authVersion
      ) ||
      authVersion < 0
    ) {
      throw new Error(
        "Cannot create session token with an invalid authentication version."
      );
    }

    /* =====================================================
       SESSION ID
    ====================================================== */

    const normalizedSessionId =
      sessionId.trim();

    if (
      !isValidSessionId(
        normalizedSessionId
      )
    ) {
      throw new Error(
        "Cannot create session token with an invalid session ID."
      );
    }

    /* =====================================================
       JWT
    ====================================================== */

    return jwt.sign(
      {
        id:
          userId,

        role,

        authVersion,

        sid:
          normalizedSessionId,
      },
      getJwtSecret(),
      {
        algorithm:
          JWT_ALGORITHM,

        expiresIn:
          AUTH_SESSION_DAYS *
          24 *
          60 *
          60,
      }
    );
  };

/* =========================================================
   ISSUE AUTHENTICATED SESSION
========================================================= */

export const issueAuthenticatedSession =
  async ({
    user,
    req,
    res,
  }: {
    user: SessionUserInput;
    req: Request;
    res: Response;
  }): Promise<{
    sessionId: string;
    token: string;
  }> => {
    /* =====================================================
       USER ID
    ====================================================== */

    const userId =
      user._id
        .toString()
        .trim();

    if (
      !isValidUserId(
        userId
      )
    ) {
      throw new Error(
        "Cannot create an authentication session for an invalid user."
      );
    }

    /* =====================================================
       ROLE
    ====================================================== */

    if (
      !isUserRole(
        user.role
      )
    ) {
      throw new Error(
        "Cannot create an authentication session for an invalid role."
      );
    }

    /* =====================================================
       REQUEST METADATA
    ====================================================== */

    const metadata =
      getSecurityRequestMetadata(
        req
      );

    /* =====================================================
       SESSION ID
    ====================================================== */

    const sessionId =
      generateSessionId();

    /* =====================================================
       EXPIRATION
    ====================================================== */

    const now =
      new Date();

    const expiresAt =
      new Date(
        now.getTime() +
          AUTH_SESSION_MAX_AGE_MS
      );

    /* =====================================================
       DATABASE SESSION
    ====================================================== */

    await AuthSession.create({
      userId,

      sessionId,

      ...metadata,

      lastActiveAt:
        now,

      expiresAt,
    });

    /* =====================================================
       JWT
    ====================================================== */

    const token =
      createSessionToken({
        userId,

        role:
          user.role,

        authVersion:
          user.authVersion ??
          0,

        sessionId,
      });

    /* =====================================================
       AUTH COOKIE
    ====================================================== */

    res.cookie(
      AUTH_COOKIE_NAME,
      token,
      getCookieOptions()
    );

    return {
      sessionId,

      token,
    };
  };

/* =========================================================
   REVOKE ALL SESSIONS
========================================================= */

export const revokeAllSessions =
  async (
    userId: string
  ): Promise<number> => {
    if (
      !isValidUserId(
        userId
      )
    ) {
      return 0;
    }

    const result =
      await AuthSession.updateMany(
        {
          userId,

          revokedAt: {
            $exists:
              false,
          },
        },
        {
          $set: {
            revokedAt:
              new Date(),
          },
        }
      );

    return (
      result.modifiedCount ??
      0
    );
  };

/* =========================================================
   REVOKE ALL OTHER SESSIONS
========================================================= */

export const revokeAllOtherSessions =
  async ({
    userId,
    currentSessionId,
  }: {
    userId: string;
    currentSessionId: string;
  }): Promise<number> => {
    if (
      !isValidUserId(
        userId
      ) ||
      !isValidSessionId(
        currentSessionId
      )
    ) {
      return 0;
    }

    const result =
      await AuthSession.updateMany(
        {
          userId,

          sessionId: {
            $ne:
              currentSessionId,
          },

          revokedAt: {
            $exists:
              false,
          },

          expiresAt: {
            $gt:
              new Date(),
          },
        },
        {
          $set: {
            revokedAt:
              new Date(),
          },
        }
      );

    return (
      result.modifiedCount ??
      0
    );
  };

/* =========================================================
   REVOKE ONE SESSION
========================================================= */

export const revokeSessionById =
  async ({
    userId,
    sessionId,
  }: {
    userId: string;
    sessionId: string;
  }): Promise<boolean> => {
    if (
      !isValidUserId(
        userId
      ) ||
      !isValidSessionId(
        sessionId
      )
    ) {
      return false;
    }

    const result =
      await AuthSession.updateOne(
        {
          userId,

          sessionId,

          revokedAt: {
            $exists:
              false,
          },

          expiresAt: {
            $gt:
              new Date(),
          },
        },
        {
          $set: {
            revokedAt:
              new Date(),
          },
        }
      );

    return (
      (result.modifiedCount ??
        0) > 0
    );
  };

/* =========================================================
   FIND ONE ACTIVE SESSION
========================================================= */

export const findActiveSession =
  async ({
    userId,
    sessionId,
  }: {
    userId: string;
    sessionId: string;
  }) => {
    if (
      !isValidUserId(
        userId
      ) ||
      !isValidSessionId(
        sessionId
      )
    ) {
      return null;
    }

    return AuthSession.findOne({
      userId,

      sessionId,

      revokedAt: {
        $exists:
          false,
      },

      expiresAt: {
        $gt:
          new Date(),
      },
    })
      .lean();
  };

/* =========================================================
   READ TOKEN FROM REQUEST
========================================================= */

export const readTokenFromRequest = (
  req: Request
): string | undefined => {
  /* =====================================================
     AUTHORIZATION HEADER
  ====================================================== */

  const authorization =
    req.headers.authorization;

  if (
    typeof authorization ===
    "string"
  ) {
    const match =
      authorization.match(
        /^Bearer\s+(.+)$/i
      );

    const bearerToken =
      match?.[1]?.trim();

    if (bearerToken) {
      return bearerToken;
    }
  }

  /* =====================================================
     COOKIE
  ====================================================== */

  const cookieToken =
    req.cookies?.[
      AUTH_COOKIE_NAME
    ];

  if (
    typeof cookieToken ===
      "string" &&
    cookieToken.trim()
  ) {
    return cookieToken.trim();
  }

  return undefined;
};

/* =========================================================
   DECODE AND VALIDATE TOKEN
========================================================= */

export const decodeSessionToken =
  (
    token: string
  ): SessionTokenPayload => {
    if (
      typeof token !==
        "string" ||
      !token.trim()
    ) {
      throw new Error(
        "Authentication token is required."
      );
    }

    /* =====================================================
       JWT VERIFY
    ====================================================== */

    const decoded =
      jwt.verify(
        token,
        getJwtSecret(),
        {
          algorithms: [
            JWT_ALGORITHM,
          ],
        }
      );

    if (
      typeof decoded ===
        "string" ||
      !decoded ||
      typeof decoded !==
        "object"
    ) {
      throw new Error(
        "Invalid authentication token payload."
      );
    }

    /* =====================================================
       USER ID
    ====================================================== */

    if (
      !isValidUserId(
        decoded.id
      )
    ) {
      throw new Error(
        "Authentication token contains an invalid user ID."
      );
    }

    /* =====================================================
       ROLE
    ====================================================== */

    if (
      !isUserRole(
        decoded.role
      )
    ) {
      throw new Error(
        "Authentication token contains an invalid user role."
      );
    }

    /* =====================================================
       AUTH VERSION
    ====================================================== */

    if (
      typeof decoded.authVersion !==
        "number" ||
      !Number.isInteger(
        decoded.authVersion
      ) ||
      decoded.authVersion < 0
    ) {
      throw new Error(
        "Authentication token contains an invalid authentication version."
      );
    }

    /* =====================================================
       SESSION ID
    ====================================================== */

    if (
      decoded.sid !==
      undefined
    ) {
      if (
        !isValidSessionId(
          decoded.sid
        )
      ) {
        throw new Error(
          "Authentication token contains an invalid session ID."
        );
      }
    }

    /* =====================================================
       BASE PAYLOAD
    ====================================================== */

    const payload:
      SessionTokenPayload = {
      id:
        decoded.id,

      role:
        decoded.role,

      authVersion:
        decoded.authVersion,
    };

    /* =====================================================
       OPTIONAL SID
    ====================================================== */

    if (
      typeof decoded.sid ===
      "string"
    ) {
      payload.sid =
        decoded.sid;
    }

    /* =====================================================
       OPTIONAL IAT
    ====================================================== */

    if (
      typeof decoded.iat ===
      "number"
    ) {
      payload.iat =
        decoded.iat;
    }

    /* =====================================================
       OPTIONAL EXP
    ====================================================== */

    if (
      typeof decoded.exp ===
      "number"
    ) {
      payload.exp =
        decoded.exp;
    }

    return payload;
  };

/* =========================================================
   GET SESSION ID FROM REQUEST
========================================================= */

export const getSessionIdFromRequest =
  (
    req: Request
  ): string | null => {
    const token =
      readTokenFromRequest(
        req
      );

    if (!token) {
      return null;
    }

    try {
      const decoded =
        decodeSessionToken(
          token
        );

      return (
        decoded.sid ??
        null
      );
    } catch {
      return null;
    }
  };

/* =========================================================
   REVOKE CURRENT SESSION
========================================================= */

export const revokeCurrentSessionFromRequest =
  async (
    req: Request
  ): Promise<void> => {
    const token =
      readTokenFromRequest(
        req
      );

    if (!token) {
      return;
    }

    try {
      const decoded =
        decodeSessionToken(
          token
        );

      if (
        decoded.id &&
        decoded.sid
      ) {
        await revokeSessionById({
          userId:
            decoded.id,

          sessionId:
            decoded.sid,
        });
      }
    } catch {
      /*
       * Logout should always remain successful from the
       * client perspective even when the token is expired,
       * malformed, already revoked, etc.
       */
    }
  };