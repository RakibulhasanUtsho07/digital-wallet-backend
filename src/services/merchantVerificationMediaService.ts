import {
  createHash,
  randomUUID,
} from "node:crypto";

import type {
  UploadApiResponse,
} from "cloudinary";

import cloudinary from "../config/cloudinary/cloudinary.js";

import {
  decryptData,
  encryptData,
  type EncryptedData,
} from "../utils/crypto.js";

import type {
  IMerchantBusinessDocument,
  MerchantBusinessDocumentKind,
} from "../models/MerchantVerification.js";

/* =========================================================
   TYPES
========================================================= */

type CloudinaryResourceType =
  | "image"
  | "raw";

interface PrivateDocumentReference {
  ownerId: string;
  merchantId: string;
  publicId: string;
  format: string;
  resourceType:
    CloudinaryResourceType;
  kind:
    MerchantBusinessDocumentKind;
  createdAt: string;
}

export interface MerchantVerificationFiles {
  registration:
    Express.Multer.File;
  tax?:
    Express.Multer.File;
  bank?:
    Express.Multer.File;
}

export interface MerchantDocumentReadView {
  kind:
    MerchantBusinessDocumentKind;
  mimeType: string;
  size: number;
  uploadedAt: Date;
  url: string;
  expiresAt: string;
}

export class MerchantDocumentError
  extends Error {
  readonly statusCode = 400;

  constructor(
    message: string
  ) {
    super(message);

    this.name =
      "MerchantDocumentError";
  }
}

/* =========================================================
   FILE VALIDATION
========================================================= */

function detectFile(
  file: Express.Multer.File
): {
  format: string;
  resourceType:
    CloudinaryResourceType;
} {
  const buffer =
    file.buffer;

  if (
    !buffer?.length
  ) {
    throw new MerchantDocumentError(
      "A merchant verification document is empty."
    );
  }

  if (
    file.size >
    5 * 1024 * 1024
  ) {
    throw new MerchantDocumentError(
      "Every business document must be 5 MB or smaller."
    );
  }

  if (
    buffer.length >= 5 &&
    buffer
      .subarray(0, 5)
      .toString("ascii") ===
      "%PDF-"
  ) {
    if (
      file.mimetype !==
      "application/pdf"
    ) {
      throw new MerchantDocumentError(
        "A document does not match its declared file type."
      );
    }

    return {
      format: "pdf",
      resourceType: "raw",
    };
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    if (
      file.mimetype !==
      "image/jpeg"
    ) {
      throw new MerchantDocumentError(
        "A document does not match its declared file type."
      );
    }

    return {
      format: "jpg",
      resourceType:
        "image",
    };
  }

  const pngSignature =
    Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
    ]);

  if (
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(
        pngSignature
      )
  ) {
    if (
      file.mimetype !==
      "image/png"
    ) {
      throw new MerchantDocumentError(
        "A document does not match its declared file type."
      );
    }

    return {
      format: "png",
      resourceType:
        "image",
    };
  }

  if (
    buffer.length >= 12 &&
    buffer
      .subarray(0, 4)
      .toString("ascii") ===
      "RIFF" &&
    buffer
      .subarray(8, 12)
      .toString("ascii") ===
      "WEBP"
  ) {
    if (
      file.mimetype !==
      "image/webp"
    ) {
      throw new MerchantDocumentError(
        "A document does not match its declared file type."
      );
    }

    return {
      format: "webp",
      resourceType:
        "image",
    };
  }

  throw new MerchantDocumentError(
    "Business documents must be valid PDF, JPG, PNG, or WEBP files."
  );
}

/* =========================================================
   PRIVATE REFERENCE
========================================================= */

function encryptReference(
  reference:
    PrivateDocumentReference
): EncryptedData {
  return encryptData(
    JSON.stringify(
      reference
    )
  );
}

function decryptReference(
  value: EncryptedData
): PrivateDocumentReference {
  try {
    const parsed =
      JSON.parse(
        decryptData(value)
      ) as Partial<PrivateDocumentReference>;

    if (
      typeof parsed.ownerId !==
        "string" ||
      typeof parsed.merchantId !==
        "string" ||
      typeof parsed.publicId !==
        "string" ||
      typeof parsed.format !==
        "string" ||
      ![
        "image",
        "raw",
      ].includes(
        String(
          parsed.resourceType
        )
      ) ||
      ![
        "registration",
        "tax",
        "bank",
      ].includes(
        String(parsed.kind)
      )
    ) {
      throw new Error(
        "Malformed reference."
      );
    }

    return parsed as
      PrivateDocumentReference;
  } catch {
    throw new Error(
      "Invalid private merchant document reference."
    );
  }
}

/* =========================================================
   CLOUDINARY OPERATIONS
========================================================= */

async function uploadOne(
  input: {
    ownerId: string;
    merchantId: string;
    kind:
      MerchantBusinessDocumentKind;
    file:
      Express.Multer.File;
    folder: string;
  }
): Promise<IMerchantBusinessDocument> {
  const detected =
    detectFile(
      input.file
    );

  const result =
    await new Promise<UploadApiResponse>(
      (
        resolve,
        reject
      ) => {
        const stream =
          cloudinary.uploader.upload_stream(
            {
              folder:
                input.folder,

              public_id:
                `${input.kind}-${randomUUID()}`,

              resource_type:
                detected.resourceType,

              type: "private",

              overwrite: false,
            },
            (
              error,
              uploadResult
            ) => {
              if (error) {
                reject(
                  new Error(
                    "Private business document upload failed."
                  )
                );

                return;
              }

              if (
                !uploadResult?.public_id
              ) {
                reject(
                  new Error(
                    "Cloudinary returned an incomplete business document response."
                  )
                );

                return;
              }

              resolve(
                uploadResult
              );
            }
          );

        stream.end(
          input.file.buffer
        );
      }
    );

  const reference:
    PrivateDocumentReference = {
    ownerId:
      input.ownerId,

    merchantId:
      input.merchantId,

    publicId:
      result.public_id,

    format:
      result.format ||
      detected.format,

    resourceType:
      detected.resourceType,

    kind:
      input.kind,

    createdAt:
      new Date().toISOString(),
  };

  return {
    kind:
      input.kind,

    mimeType:
      input.file.mimetype,

    size:
      input.file.size,

    objectRefEncrypted:
      encryptReference(
        reference
      ),

    uploadedAt:
      new Date(),
  };
}

export async function uploadMerchantDocuments(
  input: {
    ownerId: string;
    merchantId: string;
    files:
      MerchantVerificationFiles;
  }
): Promise<IMerchantBusinessDocument[]> {
  const ownerFolder =
    createHash("sha256")
      .update(
        `${input.ownerId}:${input.merchantId}`,
        "utf8"
      )
      .digest("hex")
      .slice(0, 32);

  const folder =
    `digital-payment/merchant-verification/${ownerFolder}/${randomUUID()}`;

  const uploaded:
    IMerchantBusinessDocument[] = [];

  try {
    uploaded.push(
      await uploadOne({
        ownerId:
          input.ownerId,

        merchantId:
          input.merchantId,

        kind:
          "registration",

        file:
          input.files.registration,

        folder,
      })
    );

    if (input.files.tax) {
      uploaded.push(
        await uploadOne({
          ownerId:
            input.ownerId,

          merchantId:
            input.merchantId,

          kind: "tax",

          file:
            input.files.tax,

          folder,
        })
      );
    }

    if (input.files.bank) {
      uploaded.push(
        await uploadOne({
          ownerId:
            input.ownerId,

          merchantId:
            input.merchantId,

          kind: "bank",

          file:
            input.files.bank,

          folder,
        })
      );
    }

    return uploaded;
  } catch (error) {
    await deleteMerchantDocuments(
      uploaded
    );

    throw error;
  }
}

export async function createMerchantDocumentReadViews(
  input: {
    merchantId: string;
    documents:
      IMerchantBusinessDocument[];
    expiresInSeconds?: number;
  }
): Promise<MerchantDocumentReadView[]> {
  const expiresInSeconds =
    input.expiresInSeconds ??
    300;

  if (
    !Number.isInteger(
      expiresInSeconds
    ) ||
    expiresInSeconds < 30 ||
    expiresInSeconds > 600
  ) {
    throw new Error(
      "Private document URL lifetime must be between 30 and 600 seconds."
    );
  }

  const expiresAtUnix =
    Math.floor(
      Date.now() / 1000
    ) + expiresInSeconds;

  const expiresAt =
    new Date(
      expiresAtUnix * 1000
    ).toISOString();

  return input.documents.map(
    (document) => {
      const reference =
        decryptReference(
          document.objectRefEncrypted
        );

      if (
        reference.merchantId !==
          input.merchantId ||
        reference.kind !==
          document.kind
      ) {
        throw new Error(
          "The business document does not belong to this merchant."
        );
      }

      const url =
        cloudinary.utils.private_download_url(
          reference.publicId,
          reference.format,
          {
            resource_type:
              reference.resourceType,

            type: "private",

            attachment: false,

            expires_at:
              expiresAtUnix,
          }
        );

      return {
        kind:
          document.kind,

        mimeType:
          document.mimeType,

        size:
          document.size,

        uploadedAt:
          document.uploadedAt,

        url,

        expiresAt,
      };
    }
  );
}

export async function deleteMerchantDocuments(
  documents:
    IMerchantBusinessDocument[]
): Promise<void> {
  await Promise.allSettled(
    documents.map(
      async (
        document
      ) => {
        const reference =
          decryptReference(
            document.objectRefEncrypted
          );

        await cloudinary.uploader.destroy(
          reference.publicId,
          {
            resource_type:
              reference.resourceType,

            type: "private",

            invalidate: true,
          }
        );
      }
    )
  );
}
