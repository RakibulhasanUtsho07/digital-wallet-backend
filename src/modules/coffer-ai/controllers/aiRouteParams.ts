import type { Request } from "express";
import { CofferAiError } from "../errors/cofferAiError.js";

/** Express 5 params can be string[]; reject ambiguous IDs at the HTTP boundary. */
export function requiredAiRouteParam(req: Request, name: string): string {
  const value = req.params[name];
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.trim().length > 128 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new CofferAiError({
      code: "AI_REQUEST_INVALID",
      message: `${name} is invalid.`,
      statusCode: 400,
    });
  }
  return value.trim();
}
