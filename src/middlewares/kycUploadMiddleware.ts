import multer from "multer";

/* =========================================================
   STORAGE (Memory Storage for Cloudinary Upload)
========================================================= */

// diskStorage সরিয়ে memoryStorage দেওয়া হয়েছে যাতে লোকাল ফোল্ডারে ফাইল সেভ না হয়
const storage = multer.memoryStorage();

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

  if (allowedMimeTypes.includes(file.mimetype)) {
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
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});