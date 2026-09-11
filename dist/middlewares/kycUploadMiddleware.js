"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.kycUpload = void 0;
const multer_1 = __importDefault(require("multer"));
/* =========================================================
   KYC UPLOAD STORAGE
========================================================= */
const storage = multer_1.default.memoryStorage();
/* =========================================================
   ALLOWED IMAGE TYPES
========================================================= */
const allowedMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
];
/* =========================================================
   FILE FILTER
========================================================= */
const fileFilter = (_req, file, callback) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
        callback(new Error("Only JPG, PNG and WEBP images are allowed."));
        return;
    }
    callback(null, true);
};
/* =========================================================
   KYC UPLOAD

   Frontend compresses each selected image to roughly
   700 KB and guarantees the processed file stays below 1 MB.

   This server-side limit is a second safety layer.
========================================================= */
exports.kycUpload = (0, multer_1.default)({
    storage,
    fileFilter,
    limits: {
        fileSize: 1 *
            1024 *
            1024,
        files: 3,
        fields: 10,
    },
});
