export class CofferAiError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly expose: boolean;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    code: string;
    message: string;
    statusCode: number;
    expose?: boolean;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = "CofferAiError";
    this.code = input.code;
    this.statusCode = input.statusCode;
    this.expose = input.expose ?? true;
    this.details = input.details;
  }
}

export function isCofferAiError(error: unknown): error is CofferAiError {
  return error instanceof CofferAiError;
}
