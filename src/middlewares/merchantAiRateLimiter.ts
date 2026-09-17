import {
  rateLimit,
} from "express-rate-limit";

export const merchantAiRateLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    limit:
      20,

    standardHeaders:
      "draft-8",

    legacyHeaders:
      false,

    message: {
      success: false,

      message:
        "AI request limit reached. Please wait a few minutes and try again.",
    },
  });