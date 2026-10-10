import rateLimit from "express-rate-limit";

export const cofferAiRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many Coffer AI requests. Please try again shortly.",
    error: {
      code: "AI_RATE_LIMITED",
    },
  },
});
