"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateKYCStatus = exports.getOrCreateKYC = void 0;
const KYC_js_1 = require("../models/KYC.js");
/* =========================================================
   GET OR CREATE KYC
========================================================= */
const getOrCreateKYC = async (userId) => {
    let kyc = await KYC_js_1.KYC.findOne({
        userId,
    });
    if (!kyc) {
        kyc =
            await KYC_js_1.KYC.create({
                userId,
                status: "not_started",
                provider: "manual",
            });
    }
    return kyc;
};
exports.getOrCreateKYC = getOrCreateKYC;
/* =========================================================
   UPDATE KYC STATUS
========================================================= */
const updateKYCStatus = async (userId, status, rejectionReason) => {
    const update = {
        status,
    };
    if (rejectionReason) {
        update.rejectionReason =
            rejectionReason;
    }
    if (status === "verified") {
        update.verifiedAt =
            new Date();
        update.rejectionReason =
            undefined;
    }
    return KYC_js_1.KYC.findOneAndUpdate({
        userId,
    }, update, {
        new: true,
        upsert: true,
    });
};
exports.updateKYCStatus = updateKYCStatus;
