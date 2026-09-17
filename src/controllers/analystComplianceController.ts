import type { Request, Response } from "express";
import { getAnalystCompliance } from "../services/analystComplianceService.js";
import { AnalystFilterError, parseAnalystFilters } from "../utils/analystFilters.js";

export async function getAnalystComplianceController(req: Request, res: Response): Promise<void> {
  try {
    const filters = parseAnalystFilters(req.query);
    const data = await getAnalystCompliance(filters);
    res.status(200).json({ success: true, data });
  } catch (error) {
    if (error instanceof AnalystFilterError) { res.status(400).json({ success: false, message: error.message }); return; }
    console.error("ANALYST COMPLIANCE ERROR:", error);
    res.status(500).json({ success: false, message: "Unable to load compliance analytics." });
  }
}
