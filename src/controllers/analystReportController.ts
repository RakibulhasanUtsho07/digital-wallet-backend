import type { Response } from "express";
import type { AuthRequest } from "../middlewares/authMiddleware.js";
import type { AnalystReportFormat } from "../models/AnalystReport.js";
import { createAnalystReport, getAnalystReport, getAnalystReportCsv, listAnalystReports } from "../services/analystReportService.js";
import type { AnalystMode, AnalystRange } from "../types/analystTypes.js";

const RANGES = new Set<AnalystRange>(["24h", "7d", "30d", "90d"]);
const MODES = new Set<AnalystMode>(["all", "test", "live"]);
const FORMATS = new Set<AnalystReportFormat>(["executive", "payments", "risk", "revenue"]);
const str = (v: unknown) => typeof v === "string" ? v.trim() : "";
const uid = (req: AuthRequest) => req.user?._id ?? null;

export async function createAnalystReportController(req: AuthRequest, res: Response): Promise<void> {
  const userId = uid(req); if (!userId) { res.status(401).json({ success: false, message: "Authentication is required." }); return; }
  const range = str(req.body?.range) as AnalystRange;
  const mode = str(req.body?.mode) as AnalystMode;
  const currency = str(req.body?.currency).toUpperCase();
  const format = str(req.body?.format) as AnalystReportFormat;
  if (!RANGES.has(range) || !MODES.has(mode) || !FORMATS.has(format) || !/^[A-Z]{3}$/.test(currency)) { res.status(400).json({ success: false, message: "Invalid report range, mode, currency, or format." }); return; }
  try {
    const report = await createAnalystReport({ userId, range, mode, currency, format });
    res.status(201).json({ success: true, report: { id: report._id.toString(), range: report.range, mode: report.mode, currency: report.currency, format: report.format, status: report.status, createdAt: report.createdAt, completedAt: report.completedAt ?? null, expiresAt: report.expiresAt } });
  } catch (error) { console.error("CREATE ANALYST REPORT ERROR:", error); res.status(500).json({ success: false, message: "Unable to generate analyst report." }); }
}

export async function listAnalystReportsController(req: AuthRequest, res: Response): Promise<void> {
  const userId = uid(req); if (!userId) { res.status(401).json({ success: false, message: "Authentication is required." }); return; }
  const raw = str(req.query.status); const status = raw === "processing" || raw === "ready" || raw === "failed" ? raw : undefined;
  try {
    const reports = await listAnalystReports({ userId, status });
    res.status(200).json({ success: true, reports: reports.map(report => ({ id: String(report._id), range: report.range, mode: report.mode, currency: report.currency, format: report.format, status: report.status, errorMessage: report.errorMessage ?? null, completedAt: report.completedAt ?? null, expiresAt: report.expiresAt, createdAt: report.createdAt })) });
  } catch (error) { console.error("LIST ANALYST REPORTS ERROR:", error); res.status(500).json({ success: false, message: "Unable to load analyst reports." }); }
}

export async function getAnalystReportController(req: AuthRequest, res: Response): Promise<void> {
  const userId = uid(req); if (!userId) { res.status(401).json({ success: false, message: "Authentication is required." }); return; }
  try {
    const report = await getAnalystReport({ reportId: str(req.params.id), userId });
    if (!report) { res.status(404).json({ success: false, message: "Analyst report not found or expired." }); return; }
    res.status(200).json({ success: true, report: { id: String(report._id), range: report.range, mode: report.mode, currency: report.currency, format: report.format, status: report.status, errorMessage: report.errorMessage ?? null, completedAt: report.completedAt ?? null, expiresAt: report.expiresAt, createdAt: report.createdAt } });
  } catch (error) { console.error("GET ANALYST REPORT ERROR:", error); res.status(500).json({ success: false, message: "Unable to load analyst report." }); }
}

export async function downloadAnalystReportController(req: AuthRequest, res: Response): Promise<void> {
  const userId = uid(req); if (!userId) { res.status(401).json({ success: false, message: "Authentication is required." }); return; }
  const reportId = str(req.params.id);
  try {
    const csv = await getAnalystReportCsv({ reportId, userId });
    if (!csv) { res.status(404).json({ success: false, message: "Report is unavailable, expired, or not ready." }); return; }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="analyst-report-${reportId}.csv"`);
    res.status(200).send(csv);
  } catch (error) { console.error("DOWNLOAD ANALYST REPORT ERROR:", error); res.status(500).json({ success: false, message: "Unable to download analyst report." }); }
}

export const listAnalystExportsController = listAnalystReportsController;
