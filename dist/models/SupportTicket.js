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
exports.SupportTicket = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const encryptedDataSchema = new mongoose_1.Schema({
    encrypted: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
}, { _id: false });
const supportTicketSchema = new mongoose_1.Schema({
    ticketNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true,
    },
    customerUserId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    subject: {
        type: String,
        required: true,
        trim: true,
        minlength: 4,
        maxlength: 180,
    },
    descriptionEncrypted: {
        type: encryptedDataSchema,
        required: true,
    },
    category: {
        type: String,
        enum: [
            "Transfer",
            "Withdrawal",
            "Deposit",
            "KYC",
            "Security",
            "Account",
            "Payment",
            "Other",
        ],
        required: true,
        index: true,
    },
    priority: {
        type: String,
        enum: ["Low", "Normal", "High", "Urgent"],
        default: "Normal",
        index: true,
    },
    status: {
        type: String,
        enum: [
            "Open",
            "Waiting for Customer",
            "In Progress",
            "Escalated",
            "Resolved",
        ],
        default: "Open",
        index: true,
    },
    waitingOn: {
        type: String,
        enum: ["admin", "customer", "none"],
        default: "admin",
        index: true,
    },
    assigneeAdminId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        index: true,
        default: undefined,
    },
    relatedReference: {
        type: String,
        trim: true,
        maxlength: 180,
        default: undefined,
    },
    tags: {
        type: [{ type: String, trim: true, maxlength: 40 }],
        default: [],
    },
    source: {
        type: String,
        enum: ["admin", "landing_page"],
        default: "admin",
        required: true,
        index: true,
    },
    slaDueAt: {
        type: Date,
        required: true,
        index: true,
    },
    firstResponseAt: { type: Date, default: undefined },
    resolvedAt: { type: Date, index: true, default: undefined },
    resolutionEncrypted: {
        type: encryptedDataSchema,
        default: undefined,
    },
    csatScore: {
        type: Number,
        min: 1,
        max: 100,
        default: undefined,
    },
    lastActivityAt: {
        type: Date,
        default: Date.now,
        index: true,
    },
    createdByAdminId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        default: undefined,
    },
    createdByUserId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        default: undefined,
    },
}, {
    timestamps: true,
    versionKey: false,
    strict: "throw",
    minimize: false,
});
supportTicketSchema.index({ status: 1, lastActivityAt: -1 });
supportTicketSchema.index({ priority: 1, slaDueAt: 1 });
supportTicketSchema.index({ customerUserId: 1, createdAt: -1 });
supportTicketSchema.index({ source: 1, createdAt: -1 });
exports.SupportTicket = mongoose_1.default.models.SupportTicket ||
    mongoose_1.default.model("SupportTicket", supportTicketSchema);
exports.default = exports.SupportTicket;
