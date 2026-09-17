import type {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  mapPathToSystemService,
} from "./systemTelemetryMiddleware.js";

import {
  recordSystemEventSafe,
} from "../services/systemLogService.js";

/* =========================================================
   ERROR TELEMETRY
========================================================= */

/*
 * Mount this BEFORE your existing errorHandler.
 *
 * app.use(systemErrorTelemetry);
 * app.use(errorHandler);
 *
 * This middleware does not send a response. It records a
 * sanitized operational error and forwards the same error.
 */

export const systemErrorTelemetry =
  (
    error:
      unknown,
    req:
      Request,
    _res:
      Response,
    next:
      NextFunction
  ): void => {
    const safeMessage =
      error instanceof
      Error
        ? error.message
        : "Unhandled application error.";

    recordSystemEventSafe({
      level:
        "ERROR",

      service:
        mapPathToSystemService(
          req.path
        ),

      category:
        "ApplicationError",

      event:
        "UnhandledRequestError",

      message:
        safeMessage,

      requestId:
        req.observability
          ?.requestId,

      traceId:
        req.observability
          ?.traceId,

      source:
        "Express",

      endpoint:
        req.path,

      method:
        req.method,

      statusCode:
        500,

      result:
        "Failed",
    });

    next(
      error
    );
  };
