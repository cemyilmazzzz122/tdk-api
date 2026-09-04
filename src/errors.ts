/**
 * Base class for all errors thrown by this library.
 */
export class TDKError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TDKError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a caller-supplied argument is invalid (e.g. an empty word).
 */
export class TDKValidationError extends TDKError {
  constructor(message: string) {
    super(message);
    this.name = "TDKValidationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a request to sozluk.gov.tr fails at the network/HTTP level
 * (connection failure, non-OK HTTP status, unparsable response, etc).
 */
export class TDKNetworkError extends TDKError {
  public readonly status?: number;
  public readonly cause?: unknown;

  constructor(message: string, options?: { status?: number; cause?: unknown }) {
    super(message);
    this.name = "TDKNetworkError";
    this.status = options?.status;
    this.cause = options?.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
