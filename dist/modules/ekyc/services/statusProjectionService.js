"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toUserKYCStatus = toUserKYCStatus;
exports.projectEKYCStatusToUser = projectEKYCStatusToUser;
const User_js_1 = require("../../../models/User.js");
function toUserKYCStatus(status) {
    if (status === "VERIFIED")
        return "verified";
    if (status === "REJECTED")
        return "rejected";
    return "pending";
}
async function projectEKYCStatusToUser(userId, status) {
    const result = await User_js_1.User.updateOne({ _id: userId, accountStatus: { $ne: "deleted" } }, { $set: { kycStatus: toUserKYCStatus(status) } });
    if (result.matchedCount !== 1) {
        throw new Error("Unable to synchronize the e-KYC status to the user account.");
    }
}
