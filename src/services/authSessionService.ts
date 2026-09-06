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

  /*
   * Must remain synchronized with models/User.ts.
   */
  role: UserRole;

  authVersion: number;

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
      httpOnly: true,

      secure:
        isProduction,

      /*
       * Production frontend/backend may be deployed on
       * different origins, so SameSite=None is required.
       */
      sameSite:
        isProduction
          ? "none"
          : "lax",

      path: "/",

      maxAge:
        AUTH_SESSION_DAYS *
        24 *
        60 *
        60 *
        1000,
    };
  };

export const clearAuthCookie = (
  res: Response
): void => {
  const {
    httpOnly,
    secure,
    sameSite,
    path,
  } =
    getCookieOptions();

  res.clearCookie(
    AUTH_COOKIE_NAME,
    {
      httpOnly,
      secure,
      sameSite,
      path,
    }
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
   CREATE SESSION TOKEN
========================================================= */

export const createSessionToken = ({
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
  if (
    !isValidUserId(
      userId
    )
  ) {
    throw new Error(
      "Cannot create session token for an invalid user ID."
    );
  }

  if (
    !isUserRole(
      role
    )
  ) {
    throw new Error(
      "Cannot create session token with an invalid user role."
    );
  }

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

  const normalizedSessionId =
    sessionId.trim();

  if (
    !normalizedSessionId ||
    normalizedSessionId.length >
      128
  ) {
    throw new Error(
      "Cannot create session token with an invalid session ID."
    );
  }

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

    if (
      !isUserRole(
        user.role
      )
    ) {
      throw new Error(
        "Cannot create an authentication session for an invalid role."
      );
    }

    const metadata =
      getSecurityRequestMetadata(
        req
      );

    const sessionId =
      crypto
        .randomBytes(24)
        .toString("hex");

    const expiresAt =
      new Date(
        Date.now() +
          AUTH_SESSION_DAYS *
            24 *
            60 *
            60 *
            1000
      );

    await AuthSession.create({
      userId,

      sessionId,

      ...metadata,

      lastActiveAt:
        new Date(),

      expiresAt,
    });

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
   REVOKE OTHER SESSIONS
========================================================= */

export const revokeAllOtherSessions =
  async ({
    userId,
    currentSessionId,
  }: {
    userId: string;
    currentSessionId: string;
  }): Promise<number> => {
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
      !userId.trim() ||
      !sessionId.trim()
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
   READ TOKEN FROM REQUEST
========================================================= */

export const readTokenFromRequest = (
  req: Request
): string | undefined => {
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

  const cookieToken =
    req.cookies?.[
      AUTH_COOKIE_NAME
    ];

  return typeof cookieToken ===
      "string" &&
    cookieToken.trim()
    ? cookieToken.trim()
    : undefined;
};

/* =========================================================
   DECODE AND VALIDATE TOKEN
========================================================= */

export const decodeSessionToken = (
  token: string
): SessionTokenPayload => {
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
    !decoded
  ) {
    throw new Error(
      "Invalid authentication token payload."
    );
  }

  if (
    !isValidUserId(
      decoded.id
    )
  ) {
    throw new Error(
      "Authentication token contains an invalid user ID."
    );
  }

  if (
    !isUserRole(
      decoded.role
    )
  ) {
    throw new Error(
      "Authentication token contains an invalid user role."
    );
  }

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

  if (
    decoded.sid !==
      undefined &&
    (
      typeof decoded.sid !==
        "string" ||
      !decoded.sid.trim() ||
      decoded.sid.length >
        128
    )
  ) {
    throw new Error(
      "Authentication token contains an invalid session ID."
    );
  }

  const payload:
    SessionTokenPayload = {
    id:
      decoded.id,

    role:
      decoded.role,

    authVersion:
      decoded.authVersion,
  };

  if (
    typeof decoded.sid ===
    "string"
  ) {
    payload.sid =
      decoded.sid;
  }

  if (
    typeof decoded.iat ===
    "number"
  ) {
    payload.iat =
      decoded.iat;
  }

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
   LOGOUT CURRENT SESSION
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
       * Logout must still clear expired, malformed or
       * revoked browser cookies.
       */
    }
  };