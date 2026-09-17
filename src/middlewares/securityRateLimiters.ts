import rateLimit from "express-rate-limit";

export const securityReadLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message:
        "Too many security requests. Please try again later.",
    },
  });

export const securitySensitiveLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,
    max: 12,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message:
        "Too many sensitive security actions. Please wait and try again.",
    },
  });

export const twoFactorVerifyLimiter =
  rateLimit({
    windowMs:
      10 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message:
        "Too many verification attempts. Please try again later.",
    },
  });

export const loginLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message:
        "Too many sign-in attempts. Please try again later.",
    },
  });
