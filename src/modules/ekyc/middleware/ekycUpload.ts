import multer from "multer";

const imageFields = new Set(["frontImage", "backImage", "selfieImage"]);
const imageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const videoMimeTypes = new Set(["video/webm", "video/mp4"]);

export const ekycEvidenceUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_request, file, callback) => {
    if (imageFields.has(file.fieldname) && imageMimeTypes.has(file.mimetype)) {
      callback(null, true);
      return;
    }
    if (file.fieldname === "livenessEvidence" && videoMimeTypes.has(file.mimetype)) {
      callback(null, true);
      return;
    }
    callback(new Error("e-KYC accepts JPG/PNG/WEBP images and one WEBM/MP4 liveness recording."));
  },
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 4,
    fields: 12,
    fieldSize: 10 * 1024,
  },
}).fields([
  { name: "frontImage", maxCount: 1 },
  { name: "backImage", maxCount: 1 },
  { name: "selfieImage", maxCount: 1 },
  { name: "livenessEvidence", maxCount: 1 },
]);

export default ekycEvidenceUpload;
