/**
 * Central error taxonomy for the Staff API (Kardo Operations). Every route
 * handler or repository should throw one of these and let the single Fastify
 * error handler (`error-handler.ts`) translate it to a response — no handler
 * formats its own error body. Message text sent to the client is always
 * generic; the Operations shell renders copy from `code`, not `message`.
 */
export type StaffApiErrorCode =
  | "STAFF_SESSION_REQUIRED"
  | "STAFF_MFA_REQUIRED"
  | "STAFF_ACCESS_DENIED"
  | "STAFF_PERMISSION_DENIED"
  | "STAFF_NOT_FOUND"
  | "STAFF_VALIDATION_FAILED"
  | "STAFF_CONFLICT"
  | "STAFF_RATE_LIMITED"
  | "STAFF_DEPENDENCY_UNAVAILABLE"
  | "STAFF_SERVICE_UNAVAILABLE"
  | "STAFF_INTERNAL_ERROR"
  | "BILLING_UNAVAILABLE"
  | "BILLING_CONFLICT";

/** Base class for every error that should reach the Operations shell as a
 * structured, safe API response instead of a generic 500. Every subclass
 * fixes its own `code`/`statusCode` in its constructor, so the error handler
 * needs only one generic `instanceof StaffApiError` branch. */
export class StaffApiError extends Error {
  readonly code: StaffApiErrorCode;
  readonly statusCode: number;

  constructor(code: StaffApiErrorCode, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

/** No bearer token, or one that failed signature/issuer/audience/claims
 * verification. The only path to 401. */
export class StaffSessionError extends StaffApiError {
  constructor(message = "A verified staff session is required.") {
    super("STAFF_SESSION_REQUIRED", 401, message);
  }
}

/** A syntactically valid staff session that has not completed MFA (AAL2). */
export class StaffMfaRequiredError extends StaffApiError {
  constructor(
    message = "Complete multi-factor authentication before using Operations.",
  ) {
    super("STAFF_MFA_REQUIRED", 403, message);
  }
}

/** The authenticated identity is not an active staff profile at all (e.g. a
 * Customer-only identity, or a revoked/invited staff account). */
export class StaffAccessError extends StaffApiError {
  constructor(
    message = "The authenticated user is not authorized for Operations.",
  ) {
    super("STAFF_ACCESS_DENIED", 403, message);
  }
}

/** An active staff session that lacks the specific permission an endpoint
 * requires. */
export class StaffPermissionError extends StaffApiError {
  constructor(
    message = "The staff session lacks permission for this operation.",
  ) {
    super("STAFF_PERMISSION_DENIED", 403, message);
  }
}

/** The resource does not exist (or is not visible through the Staff API). */
export class StaffNotFoundError extends StaffApiError {
  constructor(message = "The requested resource was not found.") {
    super("STAFF_NOT_FOUND", 404, message);
  }
}

/** A client-supplied value (body, query, cursor) failed a check that Fastify's
 * schema validation does not itself express. */
export class StaffValidationError extends StaffApiError {
  constructor(message = "The request did not match the expected shape.") {
    super("STAFF_VALIDATION_FAILED", 400, message);
  }
}

/** The requested state transition is not valid from the resource's current
 * state (e.g. retrying a publication that is not `failed`, a duplicate plan
 * code). */
export class StaffConflictError extends StaffApiError {
  constructor(message: string) {
    super("STAFF_CONFLICT", 409, message);
  }
}

/** Too many requests from this caller inside the window. The Staff API had no
 * rate limit at all, so a valid staff token (or bare traffic) could hammer the
 * JWT verification and the database unbounded (security review 2026-10-12).
 * Carries the seconds to wait so the error handler can set `Retry-After`. */
export class StaffRateLimitedError extends StaffApiError {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super("STAFF_RATE_LIMITED", 429, "Too many requests. Try again shortly.");
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** A downstream dependency this endpoint needs (Resolver, Publisher,
 * Analytics Engine) is either not configured or did not respond usefully. */
export class StaffDependencyError extends StaffApiError {
  constructor(message: string) {
    super("STAFF_DEPENDENCY_UNAVAILABLE", 503, message);
  }
}

/** Staff storage itself (Postgres) is not configured or not reachable. */
export class StaffRepositoryError extends StaffApiError {
  constructor(message = "Staff storage is not available.") {
    super("STAFF_SERVICE_UNAVAILABLE", 503, message);
  }
}

/** Suscripciones (ADR 019): Stripe is not configured for the Staff API. */
export class StaffBillingUnavailableError extends StaffApiError {
  constructor(message = "Billing is not configured in this environment.") {
    super("BILLING_UNAVAILABLE", 503, message);
  }
}

/** Suscripciones: the action does not fit the subscription or invoice state
 * (not trialing, nothing left to refund, no card payment). */
export class StaffBillingConflictError extends StaffApiError {
  constructor(message: string) {
    super("BILLING_CONFLICT", 409, message);
  }
}
