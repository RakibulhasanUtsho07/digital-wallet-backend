import mongoose from "mongoose";

import {
  EKYCVerification,
} from "../modules/ekyc/models/EKYCVerification.js";

import {
  Merchant,
} from "../models/Merchant.js";

import {
  MerchantApiKey,
} from "../models/MerchantApiKey.js";

import {
  MerchantVerification,
  type IMerchantBusinessDocument,
  type IMerchantVerification,
  type MerchantRegistrationType,
  type MerchantVerificationStatus,
} from "../models/MerchantVerification.js";

import {
  User,
} from "../models/User.js";

import {
  createLookupHash,
  encryptData,
} from "../utils/crypto.js";

import {
  createMerchantDocumentReadViews,
  deleteMerchantDocuments,
  uploadMerchantDocuments,
  type MerchantDocumentReadView,
  type MerchantVerificationFiles,
} from "./merchantVerificationMediaService.js";

/* =========================================================
   ERROR
========================================================= */

export type MerchantVerificationErrorCode =
  | "INVALID_REQUEST"
  | "AUTHENTICATION_REQUIRED"
  | "MERCHANT_NOT_FOUND"
  | "OWNER_EKYC_REQUIRED"
  | "VERIFICATION_NOT_FOUND"
  | "SUBMISSION_NOT_ALLOWED"
  | "REVIEW_NOT_ALLOWED"
  | "REGISTRATION_ALREADY_USED";

export class MerchantVerificationError
  extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code:
      MerchantVerificationErrorCode
  ) {
    super(message);

    this.name =
      "MerchantVerificationError";
  }
}

/* =========================================================
   INPUT / OUTPUT TYPES
========================================================= */

export interface SubmitMerchantVerificationInput {
  ownerId: string;
  legalBusinessName: unknown;
  registrationType: unknown;
  registrationNumber: unknown;
  businessAddress: unknown;
  files:
    MerchantVerificationFiles;
}

export interface MerchantVerificationView {
  id: string;
  merchantId: string;
  ownerId: string;
  ownerEkycVerificationId: string;
  status:
    MerchantVerificationStatus;
  legalBusinessName: string;
  registrationType:
    MerchantRegistrationType;
  registrationNumberMasked: string;
  businessAddress: string;
  documents: Array<{
    kind: string;
    mimeType: string;
    size: number;
    uploadedAt: Date;
  }>;
  submissionVersion: number;
  submittedAt?: Date;
  reviewStartedAt?: Date;
  reviewedAt?: Date;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MerchantVerificationStatusResult {
  ownerIdentity: {
    verified: boolean;
  };

  merchant: {
    id: string;
    businessName: string;
    status: string;
    verificationStatus: string;
    testEnabled: boolean;
    liveEnabled: boolean;
  };

  verification:
    MerchantVerificationView | null;

  apiAccess: {
    test: boolean;
    live: boolean;
  };
}

export interface AdminMerchantVerificationDetail
  extends MerchantVerificationView {
  merchant: {
    businessName: string;
    businessEmail: string;
    businessPhone?: string;
    businessType: string;
    websiteUrl?: string;
    country: string;
    countryCode: string;
  };

  owner: {
    id: string;
    name: string;
    email?: string;
    kycStatus?: string;
  };

  documentReadUrls:
    MerchantDocumentReadView[];
}

/* =========================================================
   CONSTANTS
========================================================= */

const REGISTRATION_TYPES:
  MerchantRegistrationType[] = [
  "trade_license",
  "company_registration",
  "partnership_deed",
  "other",
];

const VERIFICATION_STATUSES:
  MerchantVerificationStatus[] = [
  "not_started",
  "submitted",
  "under_review",
  "verified",
  "rejected",
];

/* =========================================================
   HELPERS
========================================================= */

function normalizeText(
  value: unknown
): string {
  return typeof value === "string"
    ? value
        .replace(
          /\s+/g,
          " "
        )
        .trim()
    : "";
}

function requireObjectId(
  value: string,
  fieldName: string
): string {
  const normalized =
    value.trim();

  if (
    !mongoose.isValidObjectId(
      normalized
    )
  ) {
    throw new MerchantVerificationError(
      `${fieldName} is invalid.`,
      400,
      "INVALID_REQUEST"
    );
  }

  return normalized;
}

function escapeRegExp(
  value: string
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function maskRegistrationNumber(
  last4: string
): string {
  return `••••••${last4}`;
}

function toView(
  verification:
    IMerchantVerification
): MerchantVerificationView {
  return {
    id:
      verification._id.toString(),

    merchantId:
      verification.merchantId.toString(),

    ownerId:
      verification.ownerId.toString(),

    ownerEkycVerificationId:
      verification.ownerEkycVerificationId.toString(),

    status:
      verification.status,

    legalBusinessName:
      verification.legalBusinessName,

    registrationType:
      verification.registrationType,

    registrationNumberMasked:
      maskRegistrationNumber(
        verification.registrationNumberLast4
      ),

    businessAddress:
      verification.businessAddress,

    documents:
      verification.documents.map(
        (document) => ({
          kind:
            document.kind,

          mimeType:
            document.mimeType,

          size:
            document.size,

          uploadedAt:
            document.uploadedAt,
        })
      ),

    submissionVersion:
      verification.submissionVersion,

    submittedAt:
      verification.submittedAt,

    reviewStartedAt:
      verification.reviewStartedAt,

    reviewedAt:
      verification.reviewedAt,

    rejectionReason:
      verification.status ===
        "rejected"
        ? verification.rejectionReason
        : undefined,

    createdAt:
      verification.createdAt,

    updatedAt:
      verification.updatedAt,
  };
}

async function findMerchantByOwner(
  ownerId: string
) {
  const normalizedOwnerId =
    requireObjectId(
      ownerId,
      "Merchant owner ID"
    );

  const merchant =
    await Merchant.findOne({
      ownerId:
        new mongoose.Types.ObjectId(
          normalizedOwnerId
        ),
    });

  if (!merchant) {
    throw new MerchantVerificationError(
      "Merchant account not found.",
      404,
      "MERCHANT_NOT_FOUND"
    );
  }

  return merchant;
}

async function findVerifiedOwnerIdentity(
  ownerId: string
) {
  const [
    owner,
    ekycVerification,
  ] = await Promise.all([
    User.findById(
      ownerId
    )
      .select(
        "name email kycStatus accountStatus"
      )
      .lean<{
        _id: mongoose.Types.ObjectId;
        name?: string;
        email?: string;
        kycStatus?: string;
        accountStatus?: string;
      }>(),

    EKYCVerification.findOne({
      userId:
        new mongoose.Types.ObjectId(
          ownerId
        ),

      status:
        "VERIFIED",
    })
      .sort({
        decidedAt: -1,
      })
      .select(
        "_id status decidedAt"
      )
      .lean<{
        _id: mongoose.Types.ObjectId;
        status: string;
        decidedAt?: Date;
      }>(),
  ]);

  const verified =
    owner?.accountStatus !==
      "deleted" &&
    owner?.kycStatus ===
      "verified" &&
    ekycVerification?.status ===
      "VERIFIED";

  return {
    owner,
    ekycVerification,
    verified,
  };
}

function parseSubmissionFields(
  input:
    SubmitMerchantVerificationInput
) {
  const legalBusinessName =
    normalizeText(
      input.legalBusinessName
    );

  if (
    legalBusinessName.length < 2 ||
    legalBusinessName.length > 160
  ) {
    throw new MerchantVerificationError(
      "Legal business name must contain between 2 and 160 characters.",
      400,
      "INVALID_REQUEST"
    );
  }

  const registrationType =
    normalizeText(
      input.registrationType
    ) as MerchantRegistrationType;

  if (
    !REGISTRATION_TYPES.includes(
      registrationType
    )
  ) {
    throw new MerchantVerificationError(
      "A valid business registration type is required.",
      400,
      "INVALID_REQUEST"
    );
  }

  const registrationNumber =
    normalizeText(
      input.registrationNumber
    );

  if (
    registrationNumber.length < 4 ||
    registrationNumber.length > 100
  ) {
    throw new MerchantVerificationError(
      "Business registration number must contain between 4 and 100 characters.",
      400,
      "INVALID_REQUEST"
    );
  }

  const businessAddress =
    normalizeText(
      input.businessAddress
    );

  if (
    businessAddress.length < 5 ||
    businessAddress.length > 500
  ) {
    throw new MerchantVerificationError(
      "Business address must contain between 5 and 500 characters.",
      400,
      "INVALID_REQUEST"
    );
  }

  return {
    legalBusinessName,
    registrationType,
    registrationNumber,
    businessAddress,
  };
}

/* =========================================================
   MERCHANT STATUS
========================================================= */

export async function getMerchantVerificationStatus(
  ownerId: string
): Promise<MerchantVerificationStatusResult> {
  const merchant =
    await findMerchantByOwner(
      ownerId
    );

  const [
    identity,
    verification,
  ] = await Promise.all([
    findVerifiedOwnerIdentity(
      ownerId
    ),

    MerchantVerification.findOne({
      merchantId:
        merchant._id,
    }),
  ]);

  const live =
    identity.verified &&
    verification?.status ===
      "verified" &&
    merchant.status ===
      "active" &&
    merchant.verificationStatus ===
      "verified" &&
    merchant.liveEnabled ===
      true;

  return {
    ownerIdentity: {
      verified:
        identity.verified,
    },

    merchant: {
      id:
        merchant._id.toString(),

      businessName:
        merchant.businessName,

      status:
        merchant.status,

      verificationStatus:
        merchant.verificationStatus,

      testEnabled:
        merchant.testEnabled,

      liveEnabled:
        merchant.liveEnabled,
    },

    verification:
      verification
        ? toView(
            verification
          )
        : null,

    apiAccess: {
      test:
        merchant.testEnabled ===
        true,

      live,
    },
  };
}

/* =========================================================
   SUBMIT BUSINESS VERIFICATION
========================================================= */

export async function submitMerchantVerification(
  input:
    SubmitMerchantVerificationInput
): Promise<MerchantVerificationStatusResult> {
  const merchant =
    await findMerchantByOwner(
      input.ownerId
    );

  const identity =
    await findVerifiedOwnerIdentity(
      input.ownerId
    );

  if (
    !identity.verified ||
    !identity.ekycVerification
  ) {
    throw new MerchantVerificationError(
      "Complete and verify the merchant owner's NID e-KYC before submitting business documents.",
      403,
      "OWNER_EKYC_REQUIRED"
    );
  }

  if (
    !input.files?.registration
  ) {
    throw new MerchantVerificationError(
      "A business registration document is required.",
      400,
      "INVALID_REQUEST"
    );
  }

  const fields =
    parseSubmissionFields(
      input
    );

  const existing =
    await MerchantVerification.findOne({
      merchantId:
        merchant._id,
    });

  if (
    existing &&
    [
      "submitted",
      "under_review",
      "verified",
    ].includes(
      existing.status
    )
  ) {
    throw new MerchantVerificationError(
      existing.status ===
        "verified"
        ? "Merchant verification is already complete."
        : "A merchant verification submission is already being reviewed.",
      409,
      "SUBMISSION_NOT_ALLOWED"
    );
  }

  const uploadedDocuments =
    await uploadMerchantDocuments({
      ownerId:
        input.ownerId,

      merchantId:
        merchant._id.toString(),

      files:
        input.files,
    });

  const previousDocuments:
    IMerchantBusinessDocument[] =
    existing?.documents
      ? [
          ...existing.documents,
        ]
      : [];

  let verificationSaved =
    false;

  try {
    const now =
      new Date();

    await MerchantVerification.findOneAndUpdate(
      {
        merchantId:
          merchant._id,

        ...(existing
          ? {
              status:
                existing.status,
            }
          : {}),
      },
      {
        $set: {
          ownerEkycVerificationId:
            identity
              .ekycVerification
              ._id,

          status:
            "submitted",

          legalBusinessName:
            fields.legalBusinessName,

          registrationType:
            fields.registrationType,

          registrationNumberEncrypted:
            encryptData(
              fields.registrationNumber
            ),

          registrationNumberHash:
            createLookupHash(
              `merchant-registration:${fields.registrationNumber}`
            ),

          registrationNumberLast4:
            fields.registrationNumber.slice(
              -4
            ),

          businessAddress:
            fields.businessAddress,

          documents:
            uploadedDocuments,

          submittedAt:
            now,

          submissionVersion:
            (
              existing
                ?.submissionVersion ||
              0
            ) + 1,

        },

        $unset: {
          reviewedAt: 1,
          reviewedBy: 1,
          reviewStartedAt: 1,
          rejectionReason: 1,
          internalReviewNote: 1,
        },

        $setOnInsert: {
          merchantId:
            merchant._id,

          ownerId:
            new mongoose.Types.ObjectId(
              input.ownerId
            ),
        },

      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    verificationSaved =
      true;

    await Merchant.updateOne(
      {
        _id:
          merchant._id,
      },
      {
        $set: {
          verificationStatus:
            "pending",

          liveEnabled:
            false,
        },

        $unset: {
          verifiedAt: 1,
          rejectedAt: 1,
        },
      }
    );

    if (
      previousDocuments.length > 0
    ) {
      await deleteMerchantDocuments(
        previousDocuments
      );
    }

    return getMerchantVerificationStatus(
      input.ownerId
    );
  } catch (error) {
    if (!verificationSaved) {
      await deleteMerchantDocuments(
        uploadedDocuments
      );
    }

    if (
      typeof error ===
        "object" &&
      error !== null &&
      "code" in error &&
      (
        error as {
          code?: unknown;
        }
      ).code === 11000
    ) {
      throw new MerchantVerificationError(
        "A merchant verification submission is already being processed.",
        409,
        "SUBMISSION_NOT_ALLOWED"
      );
    }

    throw error;
  }
}

/* =========================================================
   ADMIN LIST
========================================================= */

export async function listAdminMerchantVerifications(
  input: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }
) {
  const status =
    normalizeText(
      input.status
    );

  if (
    status &&
    !VERIFICATION_STATUSES.includes(
      status as
        MerchantVerificationStatus
    )
  ) {
    throw new MerchantVerificationError(
      "Invalid merchant verification status filter.",
      400,
      "INVALID_REQUEST"
    );
  }

  const page =
    Number.isInteger(
      input.page
    ) &&
    Number(input.page) > 0
      ? Number(input.page)
      : 1;

  const limit =
    Number.isInteger(
      input.limit
    )
      ? Math.min(
          Math.max(
            Number(input.limit),
            1
          ),
          100
        )
      : 20;

  const filter:
    Record<string, unknown> = {};

  if (status) {
    filter.status =
      status;
  }

  const search =
    normalizeText(
      input.search
    ).slice(0, 100);

  if (search) {
    const expression =
      new RegExp(
        escapeRegExp(
          search
        ),
        "i"
      );

    filter.$or = [
      {
        legalBusinessName:
          expression,
      },
      {
        registrationNumberLast4:
          expression,
      },
    ];
  }

  const [
    records,
    total,
  ] = await Promise.all([
    MerchantVerification.find(
      filter
    )
      .sort({
        submittedAt: 1,
      })
      .skip(
        (page - 1) *
          limit
      )
      .limit(limit),

    MerchantVerification.countDocuments(
      filter
    ),
  ]);

  return {
    verifications:
      records.map(
        toView
      ),

    pagination: {
      page,
      limit,
      total,
      totalPages:
        Math.ceil(
          total / limit
        ),
    },
  };
}

/* =========================================================
   ADMIN DETAILS
========================================================= */

export async function getAdminMerchantVerification(
  verificationId: string
): Promise<AdminMerchantVerificationDetail> {
  const normalizedId =
    requireObjectId(
      verificationId,
      "Merchant verification ID"
    );

  const verification =
    await MerchantVerification.findById(
      normalizedId
    );

  if (!verification) {
    throw new MerchantVerificationError(
      "Merchant verification not found.",
      404,
      "VERIFICATION_NOT_FOUND"
    );
  }

  const [
    merchant,
    owner,
    documentReadUrls,
  ] = await Promise.all([
    Merchant.findById(
      verification.merchantId
    )
      .select(
        "businessName businessEmail businessPhone businessType websiteUrl country countryCode"
      )
      .lean(),

    User.findById(
      verification.ownerId
    )
      .select(
        "name email kycStatus"
      )
      .lean<{
        _id: mongoose.Types.ObjectId;
        name?: string;
        email?: string;
        kycStatus?: string;
      }>(),

    createMerchantDocumentReadViews({
      merchantId:
        verification.merchantId.toString(),

      documents:
        verification.documents,

      expiresInSeconds: 300,
    }),
  ]);

  if (
    !merchant ||
    !owner
  ) {
    throw new MerchantVerificationError(
      "Merchant verification ownership data is unavailable.",
      404,
      "VERIFICATION_NOT_FOUND"
    );
  }

  return {
    ...toView(
      verification
    ),

    merchant: {
      businessName:
        merchant.businessName,

      businessEmail:
        merchant.businessEmail,

      businessPhone:
        merchant.businessPhone,

      businessType:
        merchant.businessType,

      websiteUrl:
        merchant.websiteUrl,

      country:
        merchant.country,

      countryCode:
        merchant.countryCode,
    },

    owner: {
      id:
        owner._id.toString(),

      name:
        owner.name ||
        "Unknown user",

      email:
        owner.email,

      kycStatus:
        owner.kycStatus,
    },

    documentReadUrls,
  };
}

/* =========================================================
   ADMIN APPROVE
========================================================= */

export async function approveMerchantVerification(
  input: {
    verificationId: string;
    adminId: string;
    internalNote?: unknown;
  }
): Promise<MerchantVerificationView> {
  const verificationId =
    requireObjectId(
      input.verificationId,
      "Merchant verification ID"
    );

  const adminId =
    requireObjectId(
      input.adminId,
      "Admin ID"
    );

  const verification =
    await MerchantVerification.findById(
      verificationId
    );

  if (!verification) {
    throw new MerchantVerificationError(
      "Merchant verification not found.",
      404,
      "VERIFICATION_NOT_FOUND"
    );
  }

  if (
    ![
      "submitted",
      "under_review",
      "verified",
    ].includes(
      verification.status
    )
  ) {
    throw new MerchantVerificationError(
      "This merchant verification cannot be approved from its current status.",
      409,
      "REVIEW_NOT_ALLOWED"
    );
  }

  const identity =
    await findVerifiedOwnerIdentity(
      verification.ownerId.toString()
    );

  if (!identity.verified) {
    throw new MerchantVerificationError(
      "The merchant owner's NID e-KYC is no longer verified.",
      409,
      "OWNER_EKYC_REQUIRED"
    );
  }

  const now =
    new Date();

  if (
    verification.status !==
    "verified"
  ) {
    verification.status =
      "verified";

    verification.reviewedAt =
      now;

    verification.reviewedBy =
      new mongoose.Types.ObjectId(
        adminId
      );

    verification.rejectionReason =
      undefined;

    const internalNote =
      normalizeText(
        input.internalNote
      );

    verification.internalReviewNote =
      internalNote
        ? internalNote.slice(
            0,
            2000
          )
        : undefined;

    try {
      await verification.save();
    } catch (error: unknown) {
      if (
        typeof error ===
          "object" &&
        error !== null &&
        "code" in error &&
        (
          error as {
            code?: unknown;
          }
        ).code === 11000
      ) {
        throw new MerchantVerificationError(
          "This business registration is already used by another verified merchant.",
          409,
          "REGISTRATION_ALREADY_USED"
        );
      }

      throw error;
    }
  }

  const merchantUpdate =
    await Merchant.updateOne(
      {
        _id:
          verification.merchantId,
      },
      {
        $set: {
          status:
            "active",

          verificationStatus:
            "verified",

          liveEnabled:
            true,

          testEnabled:
            true,

          verifiedAt:
            now,

          activatedAt:
            now,
        },

        $unset: {
          rejectedAt: 1,
          suspendedAt: 1,
          suspendedReason: 1,
        },
      }
    );

  if (
    merchantUpdate.matchedCount !==
    1
  ) {
    throw new MerchantVerificationError(
      "Merchant account not found.",
      404,
      "MERCHANT_NOT_FOUND"
    );
  }

  return toView(
    verification
  );
}

/* =========================================================
   ADMIN REJECT
========================================================= */

export async function rejectMerchantVerification(
  input: {
    verificationId: string;
    adminId: string;
    reason: unknown;
    internalNote?: unknown;
  }
): Promise<MerchantVerificationView> {
  const verificationId =
    requireObjectId(
      input.verificationId,
      "Merchant verification ID"
    );

  const adminId =
    requireObjectId(
      input.adminId,
      "Admin ID"
    );

  const reason =
    normalizeText(
      input.reason
    );

  if (
    reason.length < 5 ||
    reason.length > 1000
  ) {
    throw new MerchantVerificationError(
      "A rejection reason between 5 and 1000 characters is required.",
      400,
      "INVALID_REQUEST"
    );
  }

  const verification =
    await MerchantVerification.findById(
      verificationId
    );

  if (!verification) {
    throw new MerchantVerificationError(
      "Merchant verification not found.",
      404,
      "VERIFICATION_NOT_FOUND"
    );
  }

  if (
    ![
      "submitted",
      "under_review",
      "rejected",
    ].includes(
      verification.status
    )
  ) {
    throw new MerchantVerificationError(
      "This merchant verification cannot be rejected from its current status.",
      409,
      "REVIEW_NOT_ALLOWED"
    );
  }

  const now =
    new Date();

  /*
   * Remove live access first. If a later write fails,
   * the system remains closed rather than fail-open.
   */
  await Promise.all([
    Merchant.updateOne(
      {
        _id:
          verification.merchantId,
      },
      {
        $set: {
          verificationStatus:
            "rejected",

          liveEnabled:
            false,

          rejectedAt:
            now,
        },

        $unset: {
          verifiedAt: 1,
        },
      }
    ),

    MerchantApiKey.updateMany(
      {
        merchantId:
          verification.merchantId,

        environment:
          "live",

        status:
          "active",
      },
      {
        $set: {
          status:
            "revoked",

          revokedAt:
            now,
        },
      }
    ),
  ]);

  verification.status =
    "rejected";

  verification.rejectionReason =
    reason;

  verification.reviewedAt =
    now;

  verification.reviewedBy =
    new mongoose.Types.ObjectId(
      adminId
    );

  const internalNote =
    normalizeText(
      input.internalNote
    );

  verification.internalReviewNote =
    internalNote
      ? internalNote.slice(
          0,
          2000
        )
      : undefined;

  await verification.save();

  return toView(
    verification
  );
}
