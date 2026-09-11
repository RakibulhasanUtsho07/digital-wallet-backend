"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentUser = getCurrentUser;
const mongoose_1 = require("mongoose");
const userManagementModelRegistry_1 = require("../services/userManagementModelRegistry");
async function getCurrentUser(req, res, next) {
    try {
        const identity = req.user;
        if (!identity) {
            res.status(401).json({ message: "Authentication required." });
            return;
        }
        const id = String(identity._id ?? identity.id ?? identity.userId ?? "");
        let user = null;
        if (id && mongoose_1.Types.ObjectId.isValid(id)) {
            user = await userManagementModelRegistry_1.UserModel.findById(id)
                .select("name email phone role status avatarUrl profileImage")
                .lean()
                .exec();
        }
        else if (typeof identity.email === "string" && identity.email) {
            user = await userManagementModelRegistry_1.UserModel.findOne({ email: identity.email.toLowerCase() })
                .select("name email phone role status avatarUrl profileImage")
                .lean()
                .exec();
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
    }
    catch (error) {
        next(error);
    }
}
