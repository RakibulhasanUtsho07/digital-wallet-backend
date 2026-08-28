"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.kycUpload = void 0;
const multer_1 = __importDefault(require("multer"));
/* =========================================================
   STORAGE (Memory Storage for Cloudinary Upload)
========================================================= */
// diskStorage সরিয়ে memoryStorage দেওয়া হয়েছে যাতে লোকাল ফোল্ডারে ফাইল সেভ না হয়
const storage = multer_1.default.memoryStorage();
/* =========================================================
   FILE FILTER
========================================================= */
const fileFilter = (_req, file, cb) => {
    const allowedMimeTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        cb(new Error("Only JPG, JPEG, PNG and WEBP images are allowed."));
    }
};
/* =========================================================
   MULTER
========================================================= */
exports.kycUpload = (0, multer_1.default)({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
});
