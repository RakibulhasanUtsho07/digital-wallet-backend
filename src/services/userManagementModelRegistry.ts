import type { Model } from "mongoose";
import * as UserModule from "../models/User";
import * as WalletModule from "../models/Wallet";
import * as KYCModule from "../models/KYC";
import * as TransactionModule from "../models/Transaction";
import * as AuditLogModule from "../models/AuditLog";
import * as AuthSessionModule from "../models/AuthSession";
import { DbRecord } from "../types/userManagement";


type ModelModule = Record<string, unknown>;

function resolveModel(moduleValue: ModelModule, names: string[]): Model<DbRecord> {
  for (const name of names) {
    const candidate = moduleValue[name] as Model<DbRecord> | undefined;
    if (candidate && typeof candidate.find === "function") return candidate;
  }

  throw new Error(`Could not resolve Mongoose model export. Tried: ${names.join(", ")}`);
}

export const UserModel = resolveModel(UserModule as ModelModule, ["default", "User", "UserModel"]);
export const WalletModel = resolveModel(WalletModule as ModelModule, ["default", "Wallet", "WalletModel"]);
export const KYCModel = resolveModel(KYCModule as ModelModule, ["default", "KYC", "KYCModel"]);
export const TransactionModel = resolveModel(TransactionModule as ModelModule, ["default", "Transaction", "TransactionModel"]);
export const AuditLogModel = resolveModel(AuditLogModule as ModelModule, ["default", "AuditLog", "AuditLogModel"]);
export const AuthSessionModel = resolveModel(AuthSessionModule as ModelModule, ["default", "AuthSession", "AuthSessionModel"]);

