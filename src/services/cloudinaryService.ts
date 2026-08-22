import type {
  UploadApiResponse,
} from "cloudinary";

import cloudinary from "../config/cloudinary/cloudinary.js";

export const uploadKYCImage = (
  buffer: Buffer,
  userId: string,
  fileName: string
): Promise<UploadApiResponse> => {
  return new Promise(
    (resolve, reject) => {
      const uploadStream =
        cloudinary.uploader.upload_stream(
          {
            folder:
              `digital-payment/kyc/${userId}`,

            public_id:
              fileName,

            resource_type:
              "image",

            type: "private",

            overwrite: true,

            invalidate: true,
          },

          (
            error,
            result
          ) => {
            if (error) {
              console.error(
                "Cloudinary upload error:",
                error
              );

              reject(error);
              return;
            }

            if (!result) {
              reject(
                new Error(
                  "Cloudinary upload failed."
                )
              );

              return;
            }

            resolve(result);
          }
        );

      uploadStream.end(buffer);
    }
  );
};

/* =========================================================
   TEMPORARY SIGNED URL
========================================================= */

export const createKYCDownloadUrl = (
  publicId: string,
  format = "jpg"
): string => {
  const expiresAt =
    Math.floor(
      Date.now() / 1000
    ) + 10 * 60;

  return cloudinary.utils.private_download_url(
    publicId,
    format,
    {
      resource_type: "image",
      type: "private",
      attachment: false,
      expires_at: expiresAt,
    }
  );
};