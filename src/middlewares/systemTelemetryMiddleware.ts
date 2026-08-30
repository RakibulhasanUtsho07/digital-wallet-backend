import type {
  NextFunction,
  Request,
  Response,
} from "express";

import type {
  SystemLogLevel,
  SystemLogResult,
  SystemLogService,
} from "../models/SystemLog.js";

import {
  createSystemRequestId,
  createSystemTraceId,
  recordSystemEventSafe,
} from "../services/systemLogService.js";

/* =========================================================
   EXPRESS REQUEST AUGMENTATION
========================================================= */

declare global {
  namespace Express {
    interface Request {
      observability?: {
        requestId:
          string;

        traceId:
          string;

        startedAt:
          bigint;
      };
    }
  }
}

/* =========================================================
   SAFE HEADER ID
========================================================= */

const safeHeaderId =
  (
    value:
      string |
      string[] |
      undefined,
    fallback:
      () => string
  ): string => {
    const candidate =
      Array.isArray(
        value
      )
        ? value[0]
        : value;

    if (
      candidate &&
      /^[A-Za-z0-9._:-]{6,120}$/.test(
        candidate
      )
    ) {
      return candidate;
    }

    return fallback();
  };

/* =========================================================
   SERVICE MAPPING
========================================================= */

export const mapPathToSystemService =
  (
    path:
      string
  ): SystemLogService => {
    if (
      path.startsWith(
        "/api/auth"
      )
    ) {
      return "Authentication";
    }

    if (
      path.startsWith(
        "/api/wallet"
      )
    ) {
      return "Wallet";
    }

    if (
      path.startsWith(
        "/api/transfers"
      )
    ) {
      return "Transfers";
    }

    if (
      path.startsWith(
        "/api/transactions"
      )
    ) {
      return "Transactions";
    }

    if (
      path.startsWith(
        "/api/kyc"
      )
    ) {
      return "KYC";
    }

    if (
      path.startsWith(
        "/api/notifications"
      )
    ) {
      return "Notifications";
    }

    if (
      path.startsWith(
        "/api/ai"
      )
    ) {
      return "AI";
    }

    if (
      path.startsWith(
        "/api/admin"
      )
    ) {
      return "System";
    }

    return "API";
  };

/* =========================================================
   STATUS MAPPING
========================================================= */

const mapStatusToLevel =
  (
    status:
      number
  ): SystemLogLevel => {
    if (
      status >=
      500
    ) {
      return "ERROR";
    }

    if (
      status >=
      400
    ) {
      return "WARN";
    }

    return "INFO";
  };

const mapStatusToResult =
  (
    status:
      number
  ): SystemLogResult => {
    if (
      status ===
        408 ||
      status ===
        504
    ) {
      return "Timeout";
    }

    if (
      status >=
      400
    ) {
      return "Failed";
    }

    return "Success";
  };

/* =========================================================
   TELEMETRY MIDDLEWARE
========================================================= */

export const systemTelemetryMiddleware =
  (
    req:
      Request,
    res:
      Response,
    next:
      NextFunction
  ): void => {
    /*
     * Avoid logging the logs dashboard API itself.
     * Otherwise every dashboard refresh generates more
     * dashboard telemetry and creates noisy recursion.
     */
    if (
      req.path.startsWith(
        "/api/admin/logs"
      )
    ) {
      next();
      return;
    }

    const requestId =
      safeHeaderId(
        req.headers[
          "x-request-id"
        ],
        createSystemRequestId
      );

    const traceId =
      safeHeaderId(
        req.headers[
          "x-trace-id"
        ],
        createSystemTraceId
      );

    const startedAt =
      process.hrtime.bigint();

    req.observability = {
      requestId,
      traceId,
      startedAt,
    };

    res.setHeader(
      "X-Request-Id",
      requestId
    );

    res.setHeader(
      "X-Trace-Id",
      traceId
    );

    res.once(
      "finish",
      () => {
        const endedAt =
          process.hrtime.bigint();

        const durationMs =
          Number(
            endedAt -
              startedAt
          ) /
          1_000_000;

        const statusCode =
          res.statusCode;

        const service =
          mapPathToSystemService(
            req.path
          );

        recordSystemEventSafe({
          level:
            mapStatusToLevel(
              statusCode
            ),

          service,

          category:
            "Request",

          event:
            `${req.method.toUpperCase()} ${req.path}`,

          message:
            `Request completed with status ${statusCode}.`,

          requestId,

          traceId,

          source:
            "HTTP",

          endpoint:
            req.path,

          method:
            req.method,

          statusCode,

          durationMs,

          result:
            mapStatusToResult(
              statusCode
            ),
        });
      }
    );

    next();
  };
