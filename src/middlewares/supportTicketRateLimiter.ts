import rateLimit from "express-rate-limit";

export const supportTicketRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  message: {
    success: false,
    message:
      "Too many support requests. Please wait before submitting another one.",
  },
});


