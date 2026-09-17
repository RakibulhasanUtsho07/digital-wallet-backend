import rateLimit from "express-rate-limit";

export const analyticsReadLimiter =
  rateLimit({
    windowMs:
      15 *
      60 *
      1000,

    max:
      240,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {
      success:
        false,

      message:
        "Too many analytics requests. Please try again later.",
    },
  });

export const analyticsExportLimiter =
  rateLimit({
    windowMs:
      15 *
      60 *
      1000,

    max:
      20,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {
      success:
        false,

      message:
        "Too many analytics export requests. Please try again later.",
    },
  });

export const analyticsReportLimiter =
  rateLimit({
    windowMs:
      15 *
      60 *
      1000,

    max:
      10,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {
      success:
        false,

      message:
        "Too many analytics report requests. Please try again later.",
    },
  });
