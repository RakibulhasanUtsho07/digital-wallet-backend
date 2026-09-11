"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ekycEvidenceUpload = void 0;
const multer_1 = __importDefault(require("multer"));
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
exports.ekycEvidenceUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    fileFilter: (_request, file, callback) => {
        if (!allowedMimeTypes.has(file.mimetype)) {
            callback(new Error("Only JPG, PNG and WEBP e-KYC images are allowed."));
            return;
        }
        callback(null, true);
    },
    limits: {
        fileSize: 1024 * 1024,
        files: 3,
        fields: 8,
        fieldSize: 10 * 1024,
    },
}).fields([
    { name: "frontImage", maxCount: 1 },
    { name: "backImage", maxCount: 1 },
    { name: "selfieImage", maxCount: 1 },
]);
exports.default = exports.ekycEvidenceUpload;
