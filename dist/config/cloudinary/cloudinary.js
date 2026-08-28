"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cloudinary_1 = require("cloudinary");
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;
console.log("Cloudinary env check:", {
    cloudName: Boolean(cloudName),
    apiKey: Boolean(apiKey),
    apiSecret: Boolean(apiSecret),
});
if (!cloudName ||
    !apiKey ||
    !apiSecret) {
    throw new Error("Cloudinary environment variables are not configured.");
}
cloudinary_1.v2.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
});
console.log("✅ Cloudinary configured");
exports.default = cloudinary_1.v2;
