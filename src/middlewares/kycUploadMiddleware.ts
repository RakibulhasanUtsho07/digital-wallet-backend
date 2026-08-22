import multer from "multer";
import path from "path";
import fs from "fs";

/* =========================================================
   KYC UPLOAD DIRECTORY
========================================================= */

const uploadDir = path.join(
  process.cwd(),
  "uploads",
  "kyc"
);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, {
    recursive: true,
  });
}

/* =========================================================
   STORAGE
========================================================= */

const storage = multer.diskStorage({
  destination: (
    _req,
    _file,
    cb
  ) => {
    cb(null, uploadDir);
  },

  filename: (
    req,
    file,
    cb
  ) => {
    const userId =
      (req as any).user?._id?.toString() ||
      "unknown";

    const extension =
      path.extname(file.originalname);

    const uniqueName =
      `${userId}-${Date.now()}-${file.fieldname}${extension}`;

    cb(null, uniqueName);
  },
});

/* =========================================================
   FILE FILTER
========================================================= */

const fileFilter: multer.Options["fileFilter"] = (
  _req,
  file,
  cb
) => {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
  ];

  if (
    allowedMimeTypes.includes(
      file.mimetype
    )
  ) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Only JPG, JPEG, PNG and WEBP images are allowed."
      )
    );
  }
};

/* =========================================================
   MULTER
========================================================= */

export const kycUpload = multer({
  storage,

  fileFilter,

  limits: {
    fileSize:
      5 * 1024 * 1024,
  },
});