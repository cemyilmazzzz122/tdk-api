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

/**
 * Reported when a source answered but its content no longer has the shape
 * this library scrapes (e.g. TDK's JS bundle stopped embedding the headword
 * list, or a page lost the marker the parser anchors to). Usually means the
 * source changed and the library needs an update.
 */
export class TDKParseError extends TDKError {
  public readonly cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "TDKParseError";
    this.cause = options?.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
