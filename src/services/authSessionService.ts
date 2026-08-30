import crypto from "crypto";
import jwt from "jsonwebtoken";

import type {
  Request,
  Response,
  CookieOptions,
} from "express";

import {
  AuthSession,
} from "../models/AuthSession.js";
import { getSecurityRequestMetadata } from "./securityRequestMetadata.js";



/* =========================================================
   CONSTANTS / TYPES
========================================================= */

export const AUTH_SESSION_DAYS =
  30;

export interface SessionTokenPayload {
  id: string;

  role:
    | "user"
    | "admin";

  authVersion: number;

  sid?: string;

  iat?: number;
  exp?: number;
}

interface SessionUserInput {
  _id: {
    toString(): string;
  };

  role:
    | "user"
    | "admin";

  authVersion?: number;
}

/* =========================================================
   COOKIE
========================================================= */

const isProductionEnvironment =
  (): boolean => {
    return (
      process.env.NODE_ENV ===
        "production" ||
      process.env.VERCEL === "1"
    );
  };

const getCookieOptions =
  (): CookieOptions => {
    const isProduction =
      isProductionEnvironment();

    return {
      httpOnly: true,

      secure:
        isProduction,

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
    "access_token",
    {
      httpOnly,
      secure,
      sameSite,
      path,
    }
  );
};

/* =========================================================
   JWT
========================================================= */

const getJwtSecret =
  (): string => {
    const secret =
      process.env
        .JWT_SECRET;

    if (!secret) {
      throw new Error(
        "JWT_SECRET is not defined."
      );
    }

    return secret;
  };

export const createSessionToken = ({
  userId,
  role,
  authVersion,
  sessionId,
}: {
  userId: string;
  role: "user" | "admin";
  authVersion: number;
  sessionId: string;
}): string => {
  return jwt.sign(
    {
      id:
        userId,
      role,
      authVersion,
      sid:
        sessionId,
    },
    getJwtSecret(),
    {
      /*
       * Numeric expiresIn avoids @types/jsonwebtoken string
       * literal compatibility problems on newer TypeScript.
       */
      expiresIn:
        AUTH_SESSION_DAYS *
        24 *
        60 *
        60,
    }
  );
};

/* =========================================================
   ISSUE SESSION
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
      userId:
        user._id.toString(),

      sessionId,

      ...metadata,

      lastActiveAt:
        new Date(),

      expiresAt,
    });

    const token =
      createSessionToken({
        userId:
          user._id.toString(),

        role:
          user.role,

        authVersion:
          user.authVersion ?? 0,

        sessionId,
      });

    res.cookie(
      "access_token",
      token,
      getCookieOptions()
    );

    return {
      sessionId,
      token,
    };
  };

/* =========================================================
   REVOKE SESSIONS
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
            $exists: false,
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
            $exists: false,
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

export const revokeSessionById =
  async ({
    userId,
    sessionId,
  }: {
    userId: string;
    sessionId: string;
  }): Promise<boolean> => {
    const result =
      await AuthSession.updateOne(
        {
          userId,
          sessionId,

          revokedAt: {
            $exists: false,
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
   TOKEN READ / DECODE
========================================================= */

export const readTokenFromRequest = (
  req: Request
): string | undefined => {
  const authorization =
    req.headers
      .authorization;

  if (
    authorization?.startsWith(
      "Bearer "
    )
  ) {
    return authorization
      .slice(
        "Bearer ".length
      )
      .trim();
  }

  const cookieToken =
    req.cookies
      ?.access_token;

  return typeof cookieToken ===
    "string"
    ? cookieToken
    : undefined;
};

export const decodeSessionToken = (
  token: string
): SessionTokenPayload => {
  return jwt.verify(
    token,
    getJwtSecret()
  ) as SessionTokenPayload;
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
       * Logout must still be allowed to clear stale/expired
       * browser cookies even if JWT verification fails.
       */
    }
  };
