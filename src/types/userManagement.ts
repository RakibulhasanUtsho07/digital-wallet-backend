import type { Request } from "express";

export interface AuthIdentity {
  id?: unknown;
  _id?: unknown;
  userId?: unknown;

  // JWT payload সাধারণত user ID `sub` field-এ রাখে।
  sub?: unknown;

  role?: unknown;
  email?: unknown;
}

export type AuthenticatedRequest = Request & {
  user?: AuthIdentity;
};

export type UserRole =
  | "user"
  | "support"
  | "analyst"
  | "admin";

export type UserStatus =
  | "active"
  | "suspended"
  | "restricted"
  | "pending";

export type KYCStatus =
  | "not_started"
  | "pending"
  | "under_review"
  | "verified"
  | "rejected";

export type WalletStatus =
  | "active"
  | "frozen"
  | "restricted"
  | "closed";

export type RiskLevel =
  | "low"
  | "medium"
  | "high";

export interface UserListQuery {
  search?: string;

  page: number;
  pageSize: number;

  sortField:
    | "name"
    | "email"
    | "status"
    | "role"
    | "kycStatus"
    | "walletStatus"
    | "riskScore"
    | "lastActive"
    | "joinedAt"
    | "createdAt"
    | "balance"
    | "transactionCount";

  sortDirection:
    | "asc"
    | "desc";

  status?: UserStatus;
  kycStatus?: KYCStatus;
  role?: UserRole;
  riskLevel?: RiskLevel;
  walletStatus?: WalletStatus;

  activity?:
    | "today"
    | "week"
    | "inactive";
}

export interface AdminUserRecord {
  id: string;
  name: string;
  email: string;
  phone: string;

  role: UserRole;
  status: UserStatus;
  kycStatus: KYCStatus;
  walletStatus: WalletStatus;

  riskLevel: RiskLevel;
  riskScore: number;

  balance: number;
  totalReceived: number;
  totalSent: number;
  transactionCount: number;

  lastActive: string;
  joinedAt: string;

  city: string;
  country: string;
  walletId: string;

  twoFactorEnabled: boolean;
  failedLoginCount: number;
  activeSessions: number;

  avatarUrl?: string;
}

export type DbRecord = Record<string, unknown> & {
  _id?: unknown;
  id?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};