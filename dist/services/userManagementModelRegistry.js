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
exports.AuthSessionModel = exports.AuditLogModel = exports.TransactionModel = exports.KYCModel = exports.WalletModel = exports.UserModel = void 0;
const UserModule = __importStar(require("../models/User"));
const WalletModule = __importStar(require("../models/Wallet"));
const KYCModule = __importStar(require("../models/KYC"));
const TransactionModule = __importStar(require("../models/Transaction"));
const AuditLogModule = __importStar(require("../models/AuditLog"));
const AuthSessionModule = __importStar(require("../models/AuthSession"));
function resolveModel(moduleValue, names) {
    for (const name of names) {
        const candidate = moduleValue[name];
        if (candidate && typeof candidate.find === "function")
            return candidate;
    }
    throw new Error(`Could not resolve Mongoose model export. Tried: ${names.join(", ")}`);
}
exports.UserModel = resolveModel(UserModule, ["default", "User", "UserModel"]);
exports.WalletModel = resolveModel(WalletModule, ["default", "Wallet", "WalletModel"]);
exports.KYCModel = resolveModel(KYCModule, ["default", "KYC", "KYCModel"]);
exports.TransactionModel = resolveModel(TransactionModule, ["default", "Transaction", "TransactionModel"]);
exports.AuditLogModel = resolveModel(AuditLogModule, ["default", "AuditLog", "AuditLogModel"]);
exports.AuthSessionModel = resolveModel(AuthSessionModule, ["default", "AuthSession", "AuthSessionModel"]);
