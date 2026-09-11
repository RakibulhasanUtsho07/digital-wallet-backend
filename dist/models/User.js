"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const mongoose_1 = __importStar(require("mongoose"));
/* =========================================================
   ENCRYPTED DATA SCHEMA
========================================================= */
const encryptedDataSchema = new mongoose_1.Schema({
    encrypted: {
        type: String,
        required: true,
    },
    iv: {
        type: String,
        required: true,
    },
    authTag: {
        type: String,
        required: true,
    },
}, {
    _id: false,
});
/* =========================================================
   USER PREFERENCES SCHEMA
========================================================= */
const userPreferencesSchema = new mongoose_1.Schema({
    theme: {
        type: String,
        enum: [
            "light",
            "dark",
            "eye-care",
            "ocean",
            "forest",
        ],
        default: "light",
        required: true,
    },
}, {
    _id: false,
});
/* =========================================================
   USER SCHEMA
========================================================= */
const userSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 100,
    },
    avatarUrl: {
        type: String,
        trim: true,
        default: "",
    },
    avatarPublicId: {
        type: String,
        trim: true,
        default: "",
        select: false,
    },
    /* =====================================================
       EMAIL
    ====================================================== */
    emailEncrypted: {
        type: encryptedDataSchema,
        required: true,
    },
    emailLookup: {
        type: String,
        required: true,
        trim: true,
    },
    /* =====================================================
       PHONE
    ====================================================== */
    phoneEncrypted: {
        type: encryptedDataSchema,
        default: undefined,
    },
    phoneLookup: {
        type: String,
        trim: true,
        default: undefined,
    },
    /* =====================================================
       PASSWORD
    ====================================================== */
    password: {
        type: String,
        required: true,
        select: false,
    },
    /* =====================================================
       ROLE
    ====================================================== */
    role: {
        type: String,
        enum: [
            "user",
            "support",
            "analyst",
            "admin",
        ],
        default: "user",
        required: true,
        index: true,
    },
    authVersion: {
        type: Number,
        default: 0,
        min: 0,
    },
    /* =====================================================
       ACCOUNT STATUS
    ====================================================== */
    accountStatus: {
        type: String,
        enum: [
            "active",
            "deleted",
        ],
        default: "active",
        required: true,
        index: true,
    },
    deletedAt: {
        type: Date,
        default: undefined,
    },
    /* =====================================================
       EMAIL VERIFICATION
    ====================================================== */
    emailVerified: {
        type: Boolean,
        default: false,
        index: true,
    },
    emailVerifiedAt: {
        type: Date,
        default: undefined,
    },
    /* =====================================================
       PASSWORD SECURITY
    ====================================================== */
    passwordPolicyVersion: {
        type: Number,
        default: 1,
        min: 1,
    },
    passwordChangedAt: {
        type: Date,
        default: undefined,
    },
    /* =====================================================
       KYC
    ====================================================== */
    kycStatus: {
        type: String,
        enum: [
            "not_started",
            "pending",
            "verified",
            "rejected",
        ],
        default: "not_started",
        required: true,
        index: true,
    },
    /* =====================================================
       WALLET
    ====================================================== */
    walletId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Wallet",
        default: undefined,
    },
    /* =====================================================
       USER PREFERENCES
    ====================================================== */
    preferences: {
        type: userPreferencesSchema,
        default: () => ({
            theme: "light",
        }),
        required: true,
    },
    /* =====================================================
       RESET PASSWORD
    ====================================================== */
    resetPasswordTokenHash: {
        type: String,
        select: false,
        default: undefined,
    },
    resetPasswordExpires: {
        type: Date,
        select: false,
        default: undefined,
    },
}, {
    timestamps: true,
    versionKey: false,
    strict: true,
    /* =====================================================
       SAFE JSON
    ====================================================== */
    toJSON: {
        virtuals: true,
        transform: (_document, returnedObject) => {
            const rawObject = returnedObject;
            const { password: _password, avatarPublicId: _avatarPublicId, resetPasswordTokenHash: _resetPasswordTokenHash, resetPasswordExpires: _resetPasswordExpires, emailEncrypted: _emailEncrypted, phoneEncrypted: _phoneEncrypted, emailLookup: _emailLookup, phoneLookup: _phoneLookup, ...safeObject } = rawObject;
            return safeObject;
        },
    },
    toObject: {
        virtuals: true,
    },
});
/* =========================================================
   INDEXES
========================================================= */
userSchema.index({
    emailLookup: 1,
}, {
    unique: true,
    name: "unique_user_email_lookup",
});
userSchema.index({
    phoneLookup: 1,
}, {
    unique: true,
    sparse: true,
    name: "unique_user_phone_lookup",
});
userSchema.index({
    role: 1,
    createdAt: -1,
}, {
    name: "user_role_created_at",
});
userSchema.index({
    accountStatus: 1,
    createdAt: -1,
}, {
    name: "user_status_created_at",
});
userSchema.index({
    kycStatus: 1,
    createdAt: -1,
}, {
    name: "user_kyc_status_created_at",
});
userSchema.index({
    emailVerified: 1,
    createdAt: -1,
}, {
    name: "user_email_verified_created_at",
});
/* =========================================================
   MODEL
========================================================= */
const UserModel = mongoose_1.default.models.User ||
    mongoose_1.default.model("User", userSchema);
exports.User = UserModel;
exports.default = UserModel;
