import type {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  runSupportAiMaintenance,
} from "../services/supportAiMaintenanceService.js";
import {
  evaluateSupportProactiveAlerts,
} from "../services/supportProactiveAlertService.js";

export async function runSupportAlertEvaluationInternalController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result =
      await evaluateSupportProactiveAlerts();

    res.json({
      success:
        true,
      data:
        result,
    });
  } catch (error) {
    next(error);
  }
}

export async function runSupportMaintenanceInternalController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result =
      await runSupportAiMaintenance();

    res.json({
      success:
        true,
      data:
        result,
    });
  } catch (error) {
    next(error);
  }
}
