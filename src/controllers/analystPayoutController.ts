import type { Request, Response } from "express";
import { getAnalystPayoutAnalytics, type AnalystPayoutStatus } from "../services/analystPayoutService.js";
import { AnalystFilterError, parseAnalystFilters } from "../utils/analystFilters.js";

const STATUSES = new Set<AnalystPayoutStatus>(["all", "pending", "processing", "completed", "failed", "cancelled"]);
const value = (input: unknown) => typeof input === "string" ? input.trim() : (Array.isArray(input) && typeof input[0] === "string" ? input[0].trim() : "");

export async function getAnalystPayoutAnalyticsController(req: Request, res: Response): Promise<void> {
  try {
    const filters = parseAnalystFilters(req.query);
    if (filters.mode !== "all") throw new AnalystFilterError("Payout analytics does not support Test/Live mode filtering.");
    const raw = value(req.query.status).toLowerCase() || "all";
    if (!STATUSES.has(raw as AnalystPayoutStatus)) throw new AnalystFilterError("status must be one of: all, pending, processing, completed, failed, cancelled.");
    const data = await getAnalystPayoutAnalytics({ filters, status: raw as AnalystPayoutStatus });
    res.status(200).json({ success: true, data });
  } catch (error) {
    if (error instanceof AnalystFilterError) { res.status(400).json({ success: false, message: error.message }); return; }
    console.error("ANALYST PAYOUT ERROR:", error);
    res.status(500).json({ success: false, message: "Unable to load payout analytics." });
  }
}
