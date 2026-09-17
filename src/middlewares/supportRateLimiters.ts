import rateLimit from "express-rate-limit";

export const supportReadLimiter =
  rateLimit({
    windowMs:
      15 *
      60 *
      1000,
    max: 240,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message:
        "Too many support dashboard requests. Please try again later.",
    },
  });

export const supportWriteLimiter =
  rateLimit({
    windowMs:
      10 *
      60 *
      1000,
    max: 90,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message:
        "Too many support changes. Please try again later.",
    },
  });

export const supportCreateLimiter =
  rateLimit({
    windowMs:
      10 *
      60 *
      1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message:
        "Too many new support tickets. Please try again later.",
    },
  });
