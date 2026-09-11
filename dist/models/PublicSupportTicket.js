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
exports.PublicSupportTicket = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const encryptedValueSchema = new mongoose_1.Schema({
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
const supportTicketSchema = new mongoose_1.Schema({
    ticketNumber: {
        type: String,
        required: true,
        unique: true,
        immutable: true,
        trim: true,
        maxlength: 40,
    },
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        default: undefined,
        index: true,
    },
    category: {
        type: String,
        enum: ["transfer", "wallet", "account", "verification", "other"],
        required: true,
        index: true,
    },
    messageEncrypted: {
        type: encryptedValueSchema,
        required: true,
        select: false,
    },
    contactEmailEncrypted: {
        type: encryptedValueSchema,
        default: undefined,
        select: false,
    },
    status: {
        type: String,
        enum: [
            "open",
            "pending",
            "in_progress",
            "resolved",
            "closed",
            "overdue",
        ],
        default: "open",
        required: true,
        index: true,
    },
    priority: {
        type: String,
        enum: ["low", "normal", "high"],
        default: "normal",
        required: true,
        index: true,
    },
    source: {
        type: String,
        enum: ["landing_page", "dashboard"],
        default: "landing_page",
        required: true,
    },
    userAgent: {
        type: String,
        trim: true,
        maxlength: 220,
        default: undefined,
    },
}, {
    timestamps: true,
    versionKey: false,
    collection: "supporttickets",
});
supportTicketSchema.index({ status: 1, createdAt: -1 });
supportTicketSchema.index({ category: 1, createdAt: -1 });
supportTicketSchema.index({ priority: 1, createdAt: -1 });
exports.PublicSupportTicket = mongoose_1.default.models.PublicSupportTicket ||
    mongoose_1.default.model("PublicSupportTicket", supportTicketSchema);
exports.default = exports.PublicSupportTicket;
