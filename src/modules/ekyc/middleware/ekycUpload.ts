import multer from "multer";

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export const ekycEvidenceUpload = multer({
  storage: multer.memoryStorage(),
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

export default ekycEvidenceUpload;
