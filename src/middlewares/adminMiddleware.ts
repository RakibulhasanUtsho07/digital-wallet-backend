import { Response, NextFunction } from "express";
import { AuthRequest } from "./authMiddleware.js";

export const adminOnly = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (req.user && req.user.role === "ADMIN") {
    next();
  } else {
    res.status(403).json({ message: "Access denied. Admin resources only." });
  }
};