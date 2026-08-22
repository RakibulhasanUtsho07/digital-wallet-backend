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
  // Accept either an Authorization: Bearer header (useful for non-browser
  // clients — Postman, mobile apps, etc.) OR the HttpOnly `access_token`
  // cookie that the backend actually sets on login/register. The web app
  // only ever has the cookie: it's HttpOnly on purpose, so frontend JS
  // can never read it to build a Bearer header itself. Without this
  // `req.cookies` fallback, every request from the web app fell straight
  // into the "no token provided" 401 below — even immediately after a
  // successful login — which is why login looked like it "wasn't working"
  // with no visible error.
  let token: string | undefined;

  if (req.headers.authorization?.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies?.access_token) {
    token = req.cookies.access_token;
  }

  if (!token) {
    res.status(401).json({ message: "Not authorized, no token provided" });
    return;
  }

  try {
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
};