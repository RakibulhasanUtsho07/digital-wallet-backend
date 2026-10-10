import crypto from "node:crypto";

import type {
  NextFunction,
  Request,
  Response,
} from "express";

function safeEqual(
  left: string,
  right: string,
): boolean {
  const leftBuffer =
    Buffer.from(
      left,
    );

  const rightBuffer =
    Buffer.from(
      right,
    );

  if (
    leftBuffer.length !==
    rightBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    leftBuffer,
    rightBuffer,
  );
}

export function requireCofferAiCron(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const configured =
    process.env
      .AI_INTERNAL_CRON_SECRET
      ?.trim() ||
    process.env
      .CRON_SECRET
      ?.trim() ||
    "";

  if (
    !configured
  ) {
    res.status(503).json({
      success:
        false,
      code:
        "AI_CRON_SECRET_NOT_CONFIGURED",
      message:
        "Internal AI cron access is not configured.",
    });

    return;
  }

  const authorization =
    req.headers
      .authorization ??
    "";

  const bearer =
    authorization
      .replace(
        /^Bearer\s+/i,
        "",
      )
      .trim();

  const headerSecret =
    typeof req.headers[
      "x-coffer-cron-secret"
    ] ===
      "string"
      ? req.headers[
          "x-coffer-cron-secret"
        ].trim()
      : "";

  const supplied =
    bearer ||
    headerSecret;

  if (
    !supplied ||
    !safeEqual(
      supplied,
      configured,
    )
  ) {
    res.status(401).json({
      success:
        false,
      code:
        "AI_CRON_UNAUTHORIZED",
      message:
        "Unauthorized internal cron request.",
    });

    return;
  }

  next();
}
