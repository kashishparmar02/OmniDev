export class AppError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, options?: { details?: unknown; cause?: unknown }) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.details = options?.details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function redactSecrets(text: string): string {
  return text
    .replace(/ATATT[A-Za-z0-9_\-=]+/g, "[REDACTED_TOKEN]")
    .replace(/(Authorization:\s*Basic\s+)[A-Za-z0-9+/=]+/gi, "$1[REDACTED]")
    .replace(/(Authorization:\s*Bearer\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/(BITBUCKET_API_TOKEN=)[^\s]+/gi, "$1[REDACTED]");
}
