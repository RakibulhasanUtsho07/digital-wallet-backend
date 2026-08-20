import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

// কাস্টম রিকোয়েস্ট ইন্টারফেস তৈরি
export interface AuthRequest extends Request {
  user?: {
    _id: string;
    role: string;
  };
}

interface DecodedToken {
  id: string;
  role: "CUSTOMER" | "ADMIN";
}

// Request-এর বদলে AuthRequest ব্যবহার করুন
export const protect = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  let token: string | undefined;

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as DecodedToken;

      const foundUser = await User.findById(decoded.id).select("-password");
      if (!foundUser) {
        res.status(401).json({ message: "User not found" });
        return;
      }

      // এখন আর এরর দেবে না
      req.user = {
        _id: foundUser._id.toString(),
        role: foundUser.role,
      };

      next();
    } catch (error) {
      res.status(401).json({ message: "Not authorized, token failed" });
    }
  } else {
    res.status(401).json({ message: "Not authorized, no token provided" });
  }
};