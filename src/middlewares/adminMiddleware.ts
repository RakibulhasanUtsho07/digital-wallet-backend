import { Response, NextFunction } from "express";

import { AuthRequest } from "./authMiddleware.js";

export const adminOnly = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Authentication required.",
    });

    return;
  }

  if (req.user.role !== "admin") {
    res.status(403).json({
      success: false,
      message: "Access denied. Admin resources only.",
    });

    return;
  }

  next();
};