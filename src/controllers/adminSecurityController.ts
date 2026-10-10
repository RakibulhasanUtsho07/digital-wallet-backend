import type { Response } from "express";

import type {
  AuthRequest,
} from "../middlewares/authMiddleware.js";
import {
  getOrCreatePlatformSettings,
  settingsToDTO,
} from "../services/platformSettingsService.js";
import { getAdminSecurityOverview } from "../services/security/admin/adminSecurityOverviewService.js";
import { parsePositiveInteger, parseSecurityRange, safeIso } from "../services/security/admin/adminSecurityQueryUtils.js";
import { queryAdminSecurityEvents } from "../services/security/admin/securityEventQueryService.js";
import { queryAdminSecuritySessions } from "../services/security/admin/securitySessionAdminService.js";
import { queryAdminIdentityRisk } from "../services/security/admin/securityIdentityRiskService.js";
import { queryAdminSecurityAudit } from "../services/security/admin/securityAuditQueryService.js";

function queryString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function sendFailure(res: Response, error: unknown, message: string): void {
  console.error(message, error);
  res.status(500).json({
    success: false,
    code: "ADMIN_SECURITY_READ_FAILED",
    message,
  });
}

export async function getAdminSecurityOverviewController(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const security = await getAdminSecurityOverview(
      parseSecurityRange(req.query.range)
    );
    res.status(200).json({ success: true, security });
  } catch (error) {
    sendFailure(res, error, "Unable to load the security overview.");
  }
}

export async function getAdminSecurityEventsController(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const result = await queryAdminSecurityEvents({
      page: parsePositiveInteger(req.query.page, 1, 10000),
      limit: parsePositiveInteger(req.query.limit, 20, 100),
      status: queryString(req.query.status),
      eventType: queryString(req.query.eventType),
      search: queryString(req.query.search).slice(0, 100),
    });
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    sendFailure(res, error, "Unable to load security events.");
  }
}

export async function getAdminSecuritySessionsController(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const result = await queryAdminSecuritySessions({
      page: parsePositiveInteger(req.query.page, 1, 10000),
      limit: parsePositiveInteger(req.query.limit, 20, 100),
      risk: queryString(req.query.risk),
      search: queryString(req.query.search).slice(0, 100),
    });
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    sendFailure(res, error, "Unable to load active security sessions.");
  }
}

export async function getAdminIdentityRiskController(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const result = await queryAdminIdentityRisk({
      page: parsePositiveInteger(req.query.page, 1, 10000),
      limit: parsePositiveInteger(req.query.limit, 20, 100),
      risk: queryString(req.query.risk),
      search: queryString(req.query.search).slice(0, 100),
    });
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    sendFailure(res, error, "Unable to load identity risk data.");
  }
}

export async function getAdminSecurityPoliciesController(
  _req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const settings = await getOrCreatePlatformSettings();
    const dto = settingsToDTO(settings);
    res.status(200).json({
      success: true,
      policies: {
        security: dto.security,
        risk: dto.risk,
        revision: settings.revision,
        updatedAt: safeIso(settings.updatedAt),
        mode: "read-only",
      },
    });
  } catch (error) {
    sendFailure(res, error, "Unable to load security policies.");
  }
}

export async function getAdminSecurityAuditController(
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const result = await queryAdminSecurityAudit({
      page: parsePositiveInteger(req.query.page, 1, 10000),
      limit: parsePositiveInteger(req.query.limit, 20, 100),
      search: queryString(req.query.search).slice(0, 100),
    });
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    sendFailure(res, error, "Unable to load the security audit trail.");
  }
}
