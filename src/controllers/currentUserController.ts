import type { NextFunction, Response } from "express";
import { Types } from "mongoose";
import { AuthenticatedRequest, DbRecord } from "../types/userManagement";
import { UserModel } from "../services/userManagementModelRegistry";


export async function getCurrentUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const identity = req.user;
    if (!identity) {
      res.status(401).json({ message: "Authentication required." });
      return;
    }

    const id = String(identity._id ?? identity.id ?? identity.userId ?? "");
    let user: DbRecord | null = null;
    if (id && Types.ObjectId.isValid(id)) {
      user = await UserModel.findById(id)
        .select("name email phone role status avatarUrl profileImage")
        .lean()
        .exec() as unknown as DbRecord | null;
    } else if (typeof identity.email === "string" && identity.email) {
      user = await UserModel.findOne({ email: identity.email.toLowerCase() })
        .select("name email phone role status avatarUrl profileImage")
        .lean()
        .exec() as unknown as DbRecord | null;
    }

    const rawRole = String(user?.role ?? identity.role ?? "user").toLowerCase();
    const isAdmin = rawRole === "admin" || rawRole === "administrator";

    res.status(200).json({
      role: isAdmin ? "Admin" : "User",
      user: {
        id: String(user?._id ?? id),
        name: String(user?.name ?? ""),
        email: String(user?.email ?? identity.email ?? ""),
        phone: String(user?.phone ?? ""),
        avatarUrl: user?.avatarUrl ?? user?.profileImage,
        status: String(user?.status ?? "active"),
      },
    });
  } catch (error) {
    next(error);
  }
}
