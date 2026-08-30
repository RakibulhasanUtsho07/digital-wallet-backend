import type {
  Request,
} from "express";

import {
  SecurityEvent,
  type SecurityEventStatus,
  type SecurityEventType,
} from "../models/SecurityEvent.js";
import { getSecurityRequestMetadata } from "./securityRequestMetadata.js";


/* =========================================================
   INPUT
========================================================= */

interface RecordSecurityEventInput {
  userId: string;
  eventType: SecurityEventType;
  title: string;
  status: SecurityEventStatus;
  detail?: string;
  sessionId?: string;
  req?: Request;
}

/* =========================================================
   SANITIZATION
========================================================= */

const sanitizeDetail = (
  value:
    | string
    | undefined
): string | undefined => {
  if (!value) {
    return undefined;
  }

  return value
    .replace(
      /Bearer\s+[^\s]+/gi,
      "Bearer [REDACTED]"
    )
    .replace(
      /\b(password|token|secret|authorization|cookie|api[_-]?key)\s*[:=]\s*([^\s,;]+)/gi,
      "$1=[REDACTED]"
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim()
    .slice(
      0,
      500
    );
};

/* =========================================================
   RECORD EVENT
========================================================= */

export const recordSecurityEvent =
  async (
    input:
      RecordSecurityEventInput
  ): Promise<void> => {
    try {
      const metadata =
        input.req
          ? getSecurityRequestMetadata(
              input.req
            )
          : null;

      await SecurityEvent.create({
        userId:
          input.userId,

        eventType:
          input.eventType,

        title:
          input.title
            .replace(
              /\s+/g,
              " "
            )
            .trim()
            .slice(
              0,
              160
            ),

        status:
          input.status,

        detail:
          sanitizeDetail(
            input.detail
          ),

        sessionId:
          input.sessionId,

        device:
          metadata?.device,

        location:
          metadata?.location,

        maskedIp:
          metadata?.maskedIp,
      });
    } catch (
      error: unknown
    ) {
      /*
       * Security telemetry must not turn an otherwise successful
       * authentication/wallet action into a failed request.
       */
      console.error(
        "SECURITY EVENT WRITE ERROR:",
        error instanceof Error
          ? error.message
          : error
      );
    }
  };
