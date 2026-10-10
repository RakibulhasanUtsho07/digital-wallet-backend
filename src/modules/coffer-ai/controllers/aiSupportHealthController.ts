import type {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  getSupportAiHealth,
} from "../services/supportAiHealthService.js";

export async function getSupportAiHealthController(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result =
      await getSupportAiHealth();

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
