import multer from "multer";

import type {
  NextFunction,
  Request,
  Response,
} from "express";

/* =========================================================
   ALLOWED FILES
========================================================= */

const allowedMimeTypes =
  new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

const allowedFields =
  new Set([
    "registrationDocument",
    "taxDocument",
    "bankDocument",
  ]);

/* =========================================================
   UPLOAD MIDDLEWARE
========================================================= */

const merchantVerificationUpload =
  multer({
    storage:
      multer.memoryStorage(),

    fileFilter: (
      _request,
      file,
      callback
    ) => {
      if (
        !allowedFields.has(
          file.fieldname
        )
      ) {
        callback(
          new Error(
            "Unexpected merchant verification document field."
          )
        );

        return;
      }

      if (
        !allowedMimeTypes.has(
          file.mimetype
        )
      ) {
        callback(
          new Error(
            "Business documents must be PDF, JPG, PNG, or WEBP files."
          )
        );

        return;
      }

      callback(
        null,
        true
      );
    },

    limits: {
      fileSize:
        5 * 1024 * 1024,

      files: 3,

      fields: 10,

      fieldSize:
        20 * 1024,
    },
  }).fields([
    {
      name:
        "registrationDocument",

      maxCount: 1,
    },
    {
      name:
        "taxDocument",

      maxCount: 1,
    },
    {
      name:
        "bankDocument",

      maxCount: 1,
    },
  ]);

export default
  merchantVerificationUpload;

/* =========================================================
   SAFE EXPRESS WRAPPER
========================================================= */

export const parseMerchantVerificationDocuments = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  merchantVerificationUpload(
    req,
    res,
    (
      error: unknown
    ) => {
      if (!error) {
        next();

        return;
      }

      if (
        error instanceof
        multer.MulterError
      ) {
        res.status(
          error.code ===
            "LIMIT_FILE_SIZE"
            ? 413
            : 400
        ).json({
          success: false,

          message:
            error.code ===
            "LIMIT_FILE_SIZE"
              ? "Every business document must be 5 MB or smaller."
              : error.message,
        });

        return;
      }

      res.status(400).json({
        success: false,

        message:
          error instanceof Error
            ? error.message
            : "Invalid merchant verification documents.",
      });
    }
  );
};
