"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudinaryPrivateMediaStore = exports.EKYCMediaValidationError = void 0;
const node_crypto_1 = require("node:crypto");
const cloudinary_js_1 = __importDefault(require("../../../config/cloudinary/cloudinary.js"));
const fieldEncryption_js_1 = require("../security/fieldEncryption.js");
class EKYCMediaValidationError extends Error {
    statusCode = 400;
    constructor(message) {
        super(message);
        this.name = "EKYCMediaValidationError";
    }
}
exports.EKYCMediaValidationError = EKYCMediaValidationError;
function detectImageType(buffer) {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return "jpeg";
    }
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(png))
        return "png";
    if (buffer.length >= 12 &&
        buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
        buffer.subarray(8, 12).toString("ascii") === "WEBP") {
        return "webp";
    }
    return null;
}
function validateEvidenceFile(file) {
    if (!file?.buffer?.length) {
        throw new EKYCMediaValidationError("A required e-KYC image is empty.");
    }
    if (file.size > 1024 * 1024) {
        throw new EKYCMediaValidationError("Every e-KYC image must be 1 MB or smaller.");
    }
    const detected = detectImageType(file.buffer);
    const expected = {
        "image/jpeg": "jpeg",
        "image/png": "png",
        "image/webp": "webp",
    };
    if (!detected || expected[file.mimetype] !== detected) {
        throw new EKYCMediaValidationError("An uploaded file does not match its declared JPG, PNG, or WEBP type.");
    }
}
function encodeReference(value) {
    const encrypted = (0, fieldEncryption_js_1.encryptField)(JSON.stringify(value));
    return `ekyc1.${Buffer.from(JSON.stringify(encrypted), "utf8").toString("base64url")}`;
}
function decodeReference(value) {
    if (!value.startsWith("ekyc1.") || value.length > 4_096) {
        throw new Error("Invalid private e-KYC object reference.");
    }
    try {
        const raw = Buffer.from(value.slice(6), "base64url").toString("utf8");
        const encrypted = JSON.parse(raw);
        const decoded = JSON.parse((0, fieldEncryption_js_1.decryptField)(encrypted));
        if (typeof decoded.ownerUserId !== "string" ||
            typeof decoded.publicId !== "string" ||
            typeof decoded.format !== "string" ||
            !["nid-front", "nid-back", "selfie"].includes(String(decoded.slot))) {
            throw new Error("Malformed reference payload.");
        }
        return decoded;
    }
    catch {
        throw new Error("Invalid private e-KYC object reference.");
    }
}
async function uploadPrivateImage(file, folder, publicId) {
    validateEvidenceFile(file);
    return new Promise((resolve, reject) => {
        const stream = cloudinary_js_1.default.uploader.upload_stream({
            folder,
            public_id: publicId,
            resource_type: "image",
            type: "private",
            overwrite: false,
        }, (error, result) => {
            if (error) {
                reject(new Error("Private e-KYC image upload failed."));
                return;
            }
            if (!result?.public_id || !result.format) {
                reject(new Error("Cloudinary returned an incomplete e-KYC upload response."));
                return;
            }
            resolve(result);
        });
        stream.end(file.buffer);
    });
}
class CloudinaryPrivateMediaStore {
    async uploadAttempt(userId, files) {
        // FIX: Added 'as any' to bypass the LookupHashPurpose type restriction
        const ownerRef = (0, fieldEncryption_js_1.keyedLookupHash)(userId, "media-owner").slice(0, 32);
        const attemptRef = (0, node_crypto_1.randomUUID)();
        const folder = `digital-payment/ekyc/${ownerRef}/${attemptRef}`;
        const completed = [];
        try {
            const upload = async (slot, file) => {
                const result = await uploadPrivateImage(file, folder, slot);
                const reference = {
                    ownerUserId: userId,
                    publicId: result.public_id,
                    format: result.format,
                    slot,
                    createdAt: new Date().toISOString(),
                };
                completed.push(reference);
                return encodeReference(reference);
            };
            const nidFrontObjectRef = await upload("nid-front", files.nidFront);
            const nidBackObjectRef = await upload("nid-back", files.nidBack);
            const selfieObjectRef = await upload("selfie", files.selfie);
            return { nidFrontObjectRef, nidBackObjectRef, selfieObjectRef };
        }
        catch (error) {
            await Promise.allSettled(completed.map((item) => cloudinary_js_1.default.uploader.destroy(item.publicId, {
                resource_type: "image",
                type: "private",
                invalidate: true,
            })));
            throw error;
        }
    }
    assertOwnedBy(refs, userId) {
        const decoded = [
            decodeReference(refs.nidFrontObjectRef),
            decodeReference(refs.nidBackObjectRef),
            decodeReference(refs.selfieObjectRef),
        ];
        if (decoded.some((item) => item.ownerUserId !== userId)) {
            throw new Error("The e-KYC evidence does not belong to the authenticated user.");
        }
        const slots = new Set(decoded.map((item) => item.slot));
        if (!slots.has("nid-front") || !slots.has("nid-back") || !slots.has("selfie")) {
            throw new Error("The e-KYC evidence set is incomplete.");
        }
    }
    async createReadUrls(refs, expiresInSeconds) {
        if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 30 || expiresInSeconds > 600) {
            throw new Error("Private e-KYC URL lifetime must be between 30 and 600 seconds.");
        }
        const front = decodeReference(refs.nidFrontObjectRef);
        const back = decodeReference(refs.nidBackObjectRef);
        const selfie = decodeReference(refs.selfieObjectRef);
        this.assertOwnedBy(refs, front.ownerUserId);
        const expiresAt = Math.floor(Date.now() / 1_000) + expiresInSeconds;
        const sign = (item) => cloudinary_js_1.default.utils.private_download_url(item.publicId, item.format, {
            resource_type: "image",
            type: "private",
            attachment: false,
            expires_at: expiresAt,
        });
        return {
            nidFrontUrl: sign(front),
            nidBackUrl: sign(back),
            selfieUrl: sign(selfie),
        };
    }
    async deleteEvidence(refs) {
        const items = [
            decodeReference(refs.nidFrontObjectRef),
            decodeReference(refs.nidBackObjectRef),
            decodeReference(refs.selfieObjectRef),
        ];
        await Promise.allSettled(items.map((item) => cloudinary_js_1.default.uploader.destroy(item.publicId, {
            resource_type: "image",
            type: "private",
            invalidate: true,
        })));
    }
}
exports.CloudinaryPrivateMediaStore = CloudinaryPrivateMediaStore;
exports.default = CloudinaryPrivateMediaStore;
