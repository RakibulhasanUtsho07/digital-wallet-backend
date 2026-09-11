"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadProfileImage = exports.createKYCDownloadUrl = exports.uploadKYCImage = void 0;
const cloudinary_js_1 = __importDefault(require("../config/cloudinary/cloudinary.js"));
/* =========================================================
   KYC IMAGE UPLOAD
========================================================= */
const uploadKYCImage = (buffer, userId, fileName) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary_js_1.default.uploader.upload_stream({
            folder: `digital-payment/kyc/${userId}`,
            public_id: fileName,
            resource_type: "image",
            /*
             * KYC evidence must not be publicly accessible.
             */
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
   TEMPORARY PRIVATE KYC URL

   Why the Cloudinary resource lookup is needed:
   ---------------------------------------------------------
   KYC uploads may be JPG, PNG or WEBP. The KYC model stores
   the private public_id, but it does not currently store the
   Cloudinary format. private_download_url requires the exact
   format, so we resolve it server-side before signing.

   The generated URL expires after 10 minutes.
========================================================= */
const createKYCDownloadUrl = async (publicId) => {
    if (!publicId ||
        !publicId.trim()) {
        throw new Error("KYC image public id is missing.");
    }
    const resource = await cloudinary_js_1.default.api.resource(publicId, {
        resource_type: "image",
        type: "private",
    });
    const format = typeof resource.format ===
        "string" &&
        resource.format.trim()
        ? resource.format
        : "";
    if (!format) {
        throw new Error("Unable to determine KYC image format.");
    }
    const expiresAt = Math.floor(Date.now() /
        1000) +
        10 *
            60;
    return cloudinary_js_1.default.utils.private_download_url(publicId, format, {
        resource_type: "image",
        type: "private",
        attachment: false,
        expires_at: expiresAt,
    });
};
exports.createKYCDownloadUrl = createKYCDownloadUrl;
/* =========================================================
   PROFILE IMAGE UPLOAD
========================================================= */
const uploadProfileImage = (buffer, publicId) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary_js_1.default.uploader.upload_stream({
            folder: "digital-payment/profile-images",
            public_id: publicId,
            resource_type: "image",
            type: "upload",
            overwrite: false,
            transformation: [
                {
                    width: 600,
                    height: 600,
                    crop: "limit",
                    quality: "auto",
                    fetch_format: "auto",
                },
            ],
        }, (error, result) => {
            if (error) {
                console.error("Profile image upload error:", error);
                reject(error);
                return;
            }
            if (!result) {
                reject(new Error("Cloudinary profile image upload failed."));
                return;
            }
            resolve(result);
        });
        uploadStream.end(buffer);
    });
};
exports.uploadProfileImage = uploadProfileImage;
