"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileImageUpload = void 0;
const multer_1 = __importDefault(require("multer"));
const allowedImageTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
]);
exports.profileImageUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
    },
    fileFilter: (_req, file, callback) => {
        if (!allowedImageTypes.has(file.mimetype)) {
            callback(new Error("Only JPG, PNG and WEBP profile images are allowed."));
            return;
        }
        callback(null, true);
    },
}).single("profileImage");
