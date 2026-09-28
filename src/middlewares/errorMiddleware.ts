import type {
  Request,
  Response,
  NextFunction,
} from "express";

import {
  isCofferAiError,
} from "../modules/coffer-ai/errors/cofferAiError.js";

/* =========================================================
   NOT FOUND
========================================================= */

export const notFound = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const error =
    new Error(
      `Not Found - ${req.originalUrl}`
    );

  res.status(404);

  next(error);
};

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const isProduction =
    process.env.NODE_ENV ===
    "production";

  /* =====================================================
     COFFER AI DOMAIN ERRORS
  ====================================================== */

  if (
    isCofferAiError(
      err
    )
  ) {
    res
      .status(
        err.statusCode
      )
      .json({
        success: false,

        code:
          err.code,

        message:
          err.expose
            ? err.message
            : "The request could not be completed.",

        ...(err.expose &&
        err.details
          ? {
              details:
                err.details,
            }
          : {}),

        ...(!isProduction
          ? {
              stack:
                err.stack,
            }
          : {}),
      });

    return;
  }

  /* =====================================================
     MONGOOSE VALIDATION ERROR
  ====================================================== */

  if (
    err instanceof Error &&
    err.name ===
      "ValidationError"
  ) {
    res
      .status(400)
      .json({
        success: false,
        code:
          "VALIDATION_ERROR",
        message:
          err.message,

        ...(!isProduction
          ? {
              stack:
                err.stack,
            }
          : {}),
      });

    return;
  }

  /* =====================================================
     MONGODB DUPLICATE KEY
  ====================================================== */

  if (
    typeof err ===
      "object" &&
    err !== null &&
    "code" in err &&
    (
      err as {
        code?: unknown;
      }
    ).code === 11000
  ) {
    res
      .status(409)
      .json({
        success: false,
        code:
          "DUPLICATE_RESOURCE",
        message:
          "A resource with the same unique value already exists.",
      });

    return;
  }

  /* =====================================================
     GENERIC ERROR
  ====================================================== */

  const statusCode =
    res.statusCode >=
      400
      ? res.statusCode
      : 500;

  const message =
    err instanceof Error
      ? err.message
      : "Internal Server Error";

  const stack =
    err instanceof Error
      ? err.stack
      : undefined;

  res
    .status(
      statusCode
    )
    .json({
      success: false,

      code:
        statusCode ===
        404
          ? "NOT_FOUND"
          : "INTERNAL_SERVER_ERROR",

      message:
        statusCode ===
          500 &&
        isProduction
          ? "Internal Server Error"
          : message,

      ...(!isProduction &&
      stack
        ? {
            stack,
          }
        : {}),
    });
};