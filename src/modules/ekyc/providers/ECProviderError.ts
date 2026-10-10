export class ECProviderError extends Error {
  constructor(
    message: string,
    readonly code:
      | "TIMEOUT"
      | "UNAVAILABLE"
      | "INVALID_RESPONSE"
      | "REQUEST_REJECTED",
    readonly transient: boolean
  ) {
    super(message);
    this.name = "ECProviderError";
  }
}
