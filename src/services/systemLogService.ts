import {
  randomUUID,
} from "crypto";

import type {
  ClientSession,
} from "mongoose";

import {
  SystemLog,
  type SystemLogEnvironment,
  type SystemLogLevel,
  type SystemLogResult,
  type SystemLogService,
} from "../models/SystemLog.js";

/* =========================================================
   INPUT
========================================================= */

export interface RecordSystemEventInput {
  level:
    SystemLogLevel;

  service:
    SystemLogService;

  category:
    string;

  event:
    string;

  message:
    string;

  requestId?:
    string;

  traceId?:
    string;

  transactionId?:
    string;

  source:
    string;

  endpoint?:
    string;

  method?:
    string;

  statusCode?:
    number;

  durationMs?:
    number;

  result:
    SystemLogResult;

  environment?:
    SystemLogEnvironment;

  timestamp?:
    Date;

  session?:
    ClientSession;
}

/* =========================================================
   REDACTION / SANITIZATION
========================================================= */

const trimTo =
  (
    value:
      string,
    max:
      number
  ) =>
    value
      .trim()
      .slice(
        0,
        max
      );

export const sanitizeLogText =
  (
    raw:
      string
  ): string => {
    let value =
      String(
        raw ?? ""
      );

    /*
     * Bearer tokens.
     */
    value =
      value.replace(
        /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
        "Bearer [REDACTED]"
      );

    /*
     * JWT-like tokens.
     */
    value =
      value.replace(
        /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/g,
        "[REDACTED_TOKEN]"
      );

    /*
     * Email addresses.
     */
    value =
      value.replace(
        /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
        "[REDACTED_EMAIL]"
      );

    /*
     * Common Bangladesh/international phone-like values.
     */
    value =
      value.replace(
        /(?:\+?88)?01[3-9]\d{8}\b/g,
        "[REDACTED_PHONE]"
      );

    /*
     * Common sensitive key/value fragments in free text.
     */
    value =
      value.replace(
        /\b(password|token|secret|authorization|cookie|api[_-]?key)\s*[:=]\s*([^\s,;]+)/gi,
        "$1=[REDACTED]"
      );

    return value;
  };

/* =========================================================
   ENVIRONMENT
========================================================= */

export const resolveLogEnvironment =
  (): SystemLogEnvironment => {
    const explicit =
      process.env
        .APP_ENVIRONMENT
        ?.trim()
        .toLowerCase();

    if (
      explicit ===
      "production"
    ) {
      return "Production";
    }

    if (
      explicit ===
      "staging"
    ) {
      return "Staging";
    }

    if (
      explicit ===
      "development"
    ) {
      return "Development";
    }

    return process.env
      .NODE_ENV ===
      "production"
      ? "Production"
      : "Development";
  };

/* =========================================================
   REQUEST / TRACE ID
========================================================= */

export const createSystemRequestId =
  () =>
    `req_${randomUUID()}`;

export const createSystemTraceId =
  () =>
    `trace_${randomUUID()}`;

/* =========================================================
   RECORD EVENT
========================================================= */

export const recordSystemEvent =
  async (
    input:
      RecordSystemEventInput
  ) => {
    const document = {
      timestamp:
        input.timestamp ??
        new Date(),

      level:
        input.level,

      service:
        input.service,

      category:
        trimTo(
          sanitizeLogText(
            input.category
          ),
          80
        ),

      event:
        trimTo(
          sanitizeLogText(
            input.event
          ),
          160
        ),

      message:
        trimTo(
          sanitizeLogText(
            input.message
          ),
          1200
        ),

      requestId:
        input.requestId
          ? trimTo(
              sanitizeLogText(
                input.requestId
              ),
              120
            )
          : undefined,

      traceId:
        input.traceId
          ? trimTo(
              sanitizeLogText(
                input.traceId
              ),
              120
            )
          : undefined,

      transactionId:
        input.transactionId
          ? trimTo(
              sanitizeLogText(
                input.transactionId
              ),
              120
            )
          : undefined,

      source:
        trimTo(
          sanitizeLogText(
            input.source
          ),
          80
        ),

      endpoint:
        input.endpoint
          ? trimTo(
              input.endpoint,
              260
            )
          : undefined,

      method:
        input.method
          ? trimTo(
              input.method
                .toUpperCase(),
              16
            )
          : undefined,

      statusCode:
        input.statusCode,

      durationMs:
        input.durationMs ===
        undefined
          ? undefined
          : Math.max(
              0,
              Math.round(
                input.durationMs
              )
            ),

      environment:
        input.environment ??
        resolveLogEnvironment(),

      result:
        input.result,
    };

    if (
      input.session
    ) {
      const created =
        await SystemLog.create(
          [
            document,
          ],
          {
            session:
              input.session,
          }
        );

      return created[0];
    }

    return SystemLog.create(
      document
    );
  };

/* =========================================================
   SAFE NON-BLOCKING RECORD
========================================================= */

export const recordSystemEventSafe =
  (
    input:
      RecordSystemEventInput
  ): void => {
    void recordSystemEvent(
      input
    ).catch(
      (
        error:
          unknown
      ) => {
        console.error(
          "SYSTEM LOG WRITE ERROR:",
          error instanceof
          Error
            ? error.message
            : error
        );
      }
    );
  };
