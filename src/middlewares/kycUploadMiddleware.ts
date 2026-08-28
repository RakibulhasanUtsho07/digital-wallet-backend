import multer from "multer";

/* =========================================================
   KYC UPLOAD STORAGE
========================================================= */

const storage =
  multer.memoryStorage();

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

const fileFilter:
  multer.Options["fileFilter"] =
  (
    _req,
    file,
    callback
  ) => {
    if (
      !allowedMimeTypes.includes(
        file.mimetype
      )
    ) {
      callback(
        new Error(
          "Only JPG, PNG and WEBP images are allowed."
        )
      );

      return;
    }

    callback(
      null,
      true
    );
  };

/* =========================================================
   KYC UPLOAD

   Frontend compresses each selected image to roughly
   700 KB and guarantees the processed file stays below 1 MB.

   This server-side limit is a second safety layer.
========================================================= */

export const kycUpload =
  multer({
    storage,

    fileFilter,

    limits: {
      fileSize:
        1 *
        1024 *
        1024,

      files:
        3,

      fields:
        10,
    },
  });
