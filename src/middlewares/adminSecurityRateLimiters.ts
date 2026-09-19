import rateLimit from "express-rate-limit";

export const adminSecurityReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: "ADMIN_SECURITY_RATE_LIMIT",
    message: "Too many security center requests. Please try again later.",
  },
});
