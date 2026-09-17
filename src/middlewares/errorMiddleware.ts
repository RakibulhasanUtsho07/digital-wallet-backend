import { Request, Response, NextFunction } from "express";

// Not Found Error Handler (যখন কোনো ভুল URL-এ রিকোয়েস্ট আসবে)
export const notFound = (req: Request, res: Response, next: NextFunction): void => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

// গ্লোবাল Error Handler (পুরো অ্যাপ্লিকেশনের যেকোনো এরর এখানে এসে ধরা পড়বে)
export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction): void => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  
  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
    // প্রোডাকশনে আমরা stack trace লুকাবো সিকিউরিটির জন্য
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });
};