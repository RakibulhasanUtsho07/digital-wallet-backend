export type AdminSecurityRange =
  | "24h"
  | "7d"
  | "30d"
  | "90d";

export type AdminSecurityPosture =
  | "healthy"
  | "attention"
  | "critical";

export type AdminSecurityRisk =
  | "low"
  | "medium"
  | "high";

export type AdminServiceHealthStatus =
  | "healthy"
  | "attention"
  | "critical"
  | "unknown";

export interface AdminSecurityTimelinePoint {
  timestamp: string;
  label: string;
  total: number;
  successfulLogins: number;
  failedLogins: number;
  suspiciousLogins: number;
}

export interface AdminSecurityServiceHealth {
  service: string;
  status: AdminServiceHealthStatus;
  totalEvents: number;
  failures: number;
  criticalEvents: number;
  failureRate: number;
  lastEventAt: string | null;
}

export interface AdminSecurityEventItem {
  id: string;
  user: {
    id: string;
    name: string;
    role: string;
  } | null;
  eventType: string;
  title: string;
  status: "success" | "warning" | "info";
  detail: string;
  device: string;
  location: string;
  maskedIp: string;
  sessionId: string | null;
  createdAt: string;
}

export interface AdminSecuritySessionItem {
  id: string;
  user: {
    id: string;
    name: string;
    role: string;
  } | null;
  device: string;
  browser: string;
  os: string;
  location: string;
  maskedIp: string;
  risk: AdminSecurityRisk;
  lastActiveAt: string;
  expiresAt: string;
  createdAt: string;
}

export interface AdminIdentityRiskItem {
  id: string;
  name: string;
  role: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  passkeyEnabled: boolean;
  activeSessions: number;
  passwordChangedAt: string | null;
  risk: AdminSecurityRisk;
  riskReasons: string[];
  createdAt: string;
}

export interface AdminSecurityAuditItem {
  id: string;
  actor: {
    id: string;
    name: string;
    role: string;
  } | null;
  action: string;
  resource: string;
  maskedIp: string;
  metadataSummary: string;
  createdAt: string;
}
