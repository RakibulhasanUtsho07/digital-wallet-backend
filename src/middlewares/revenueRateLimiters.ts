import rateLimit from "express-rate-limit";

/* =========================================================
   REVENUE READ LIMITER

   Used for:
   GET /fee-policy
   GET /leakage
   GET /contributors
========================================================= */

export const revenueReadLimiter =
  rateLimit({
    windowMs:
      15 *
      60 *
      1000,

    max:
      180,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {
      success:
        false,

      message:
        "Too many revenue analytics requests. Please try again later.",
    },
  });

/* =========================================================
   REVENUE SIMULATION LIMITER

   Used for:
   POST /simulate
========================================================= */

export const revenueSimulationLimiter =
  rateLimit({
    windowMs:
      10 *
      60 *
      1000,

    max:
      80,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {
      success:
        false,

      message:
        "Too many revenue simulations. Please try again later.",
    },
  });

/* =========================================================
   REVENUE WRITE LIMITER

   Used for:
   POST /leakage/investigate
========================================================= */

export const revenueWriteLimiter =
  rateLimit({
    windowMs:
      10 *
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
        "Too many revenue investigation requests. Please try again later.",
    },
  });