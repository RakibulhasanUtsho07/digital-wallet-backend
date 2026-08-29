import type {
  UploadApiResponse,
} from "cloudinary";

import cloudinary from "../config/cloudinary/cloudinary.js";

/* =========================================================
   KYC IMAGE UPLOAD
========================================================= */

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

            /*
             * KYC evidence must not be publicly accessible.
             */
            type:
              "private",

            overwrite:
              true,

            invalidate:
              true,
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

              reject(
                error
              );

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

            resolve(
              result
            );
          }
        );

      uploadStream.end(
        buffer
      );
    }
  );
};

/* =========================================================
   TEMPORARY PRIVATE KYC URL

   Why the Cloudinary resource lookup is needed:
   ---------------------------------------------------------
   KYC uploads may be JPG, PNG or WEBP. The KYC model stores
   the private public_id, but it does not currently store the
   Cloudinary format. private_download_url requires the exact
   format, so we resolve it server-side before signing.

   The generated URL expires after 10 minutes.
========================================================= */

export const createKYCDownloadUrl =
  async (
    publicId: string
  ): Promise<string> => {
    if (
      !publicId ||
      !publicId.trim()
    ) {
      throw new Error(
        "KYC image public id is missing."
      );
    }

    const resource =
      await cloudinary.api.resource(
        publicId,
        {
          resource_type:
            "image",

          type:
            "private",
        }
      );

    const format =
      typeof resource.format ===
        "string" &&
      resource.format.trim()
        ? resource.format
        : "";

    if (!format) {
      throw new Error(
        "Unable to determine KYC image format."
      );
    }

    const expiresAt =
      Math.floor(
        Date.now() /
          1000
      ) +
      10 *
        60;

    return cloudinary.utils.private_download_url(
      publicId,
      format,
      {
        resource_type:
          "image",

        type:
          "private",

        attachment:
          false,

        expires_at:
          expiresAt,
      }
    );
  };
