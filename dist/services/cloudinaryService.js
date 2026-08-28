"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createKYCDownloadUrl = exports.uploadKYCImage = void 0;
const cloudinary_js_1 = __importDefault(require("../config/cloudinary/cloudinary.js"));
const uploadKYCImage = (buffer, userId, fileName) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary_js_1.default.uploader.upload_stream({
            folder: `digital-payment/kyc/${userId}`,
            public_id: fileName,
            resource_type: "image",
            type: "private",
            overwrite: true,
            invalidate: true,
        }, (error, result) => {
            if (error) {
                console.error("Cloudinary upload error:", error);
                reject(error);
                return;
            }
            if (!result) {
                reject(new Error("Cloudinary upload failed."));
                return;
            }
            resolve(result);
        });
        uploadStream.end(buffer);
    });
};
exports.uploadKYCImage = uploadKYCImage;
/* =========================================================
   TEMPORARY SIGNED URL
========================================================= */
const createKYCDownloadUrl = (publicId, format = "jpg") => {
    const expiresAt = Math.floor(Date.now() / 1000) + 10 * 60;
    return cloudinary_js_1.default.utils.private_download_url(publicId, format, {
        resource_type: "image",
        type: "private",
        attachment: false,
        expires_at: expiresAt,
    });
};
exports.createKYCDownloadUrl = createKYCDownloadUrl;
