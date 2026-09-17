import rateLimit from "express-rate-limit";

export const kycAIReadLimiter =
  rateLimit({
    windowMs:
      15 *
      60 *
      1000,

    max:
      120,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {
      success:
        false,

      message:
        "Too many KYC intelligence requests. Please try again later.",
    },
  });

export const kycAIRunLimiter =
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
        "Too many automated KYC review requests. Please try again later.",
    },
  });
