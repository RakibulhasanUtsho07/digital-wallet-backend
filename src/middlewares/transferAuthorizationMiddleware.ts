import type { NextFunction, Response } from "express";
import { User } from "../models/User.js";
import { consumePaymentAuthorization } from "../services/paymentAuthorizationService.js";
import { verifyPassword } from "../utils/password.js";
import type { AuthRequest } from "./authMiddleware.js";

export interface AuthorizedTransferRequest extends AuthRequest {
  transferAuthorization?: { method: "PASSKEY" | "PASSWORD" };
}

export async function requireTransferAuthorization(
  req: AuthorizedTransferRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?._id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Authentication required." });
      return;
    }

    const idempotencyKey = req.get("Idempotency-Key")?.trim() || "";
    const paymentToken = req.get("X-Payment-Authorization")?.trim() || "";
    if (paymentToken) {
      const verified = await consumePaymentAuthorization({
        userId,
        token: paymentToken,
        transfer: {
          recipient: req.body?.recipient,
          amount: req.body?.amount,
          reference: req.body?.reference,
          idempotencyKey,
        },
      });
      if (!verified) {
        res.status(401).json({
          success: false,
          code: "PAYMENT_AUTHORIZATION_INVALID",
          message: "Payment authorization is invalid, expired, used, or does not match this transfer.",
        });
        return;
      }
      req.transferAuthorization = { method: "PASSKEY" };
      next();
      return;
    }

    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!password) {
      res.status(400).json({
        success: false,
        code: "PAYMENT_AUTHORIZATION_REQUIRED",
        message: "Use your device passkey or enter your login password.",
      });
      return;
    }

    const user = await User.findOne({ _id: userId, accountStatus: { $ne: "deleted" } }).select("+password");
    const storedPassword = user?.get("password") as string | undefined;
    if (!storedPassword || !(await verifyPassword(storedPassword, password))) {
      res.status(401).json({ success: false, message: "Incorrect password." });
      return;
    }

    req.transferAuthorization = { method: "PASSWORD" };
    next();
  } catch (error) {
    console.error("TRANSFER AUTHORIZATION ERROR:", error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, message: "Unable to authorize this transfer." });
  }
}
