import multer from "multer";

const allowedImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const profileImageUpload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },

  fileFilter: (_req, file, callback) => {
    if (!allowedImageTypes.has(file.mimetype)) {
      callback(
        new Error(
          "Only JPG, PNG and WEBP profile images are allowed.",
        ),
      );
      return;
    }

    callback(null, true);
  },
}).single("profileImage");