/**
 * Central error taxonomy for the Customer API. Every route handler should
 * throw one of these (or let a lower-level helper throw one) and let the
 * single Fastify error handler in `app.ts` translate it to a response. No
 * handler should format its own error response any more: that guarantees a
 * single place decides status codes, `code` values and safe messages.
 */

/** A well-known, machine-readable API error code. Message text sent to the
 * customer is always generic; the frontend renders copy based on `code`. */
export type ApiErrorCode =
  | "AUTH_REQUIRED"
  | "MFA_REQUIRED"
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "WORKSPACE_ACCESS_DENIED"
  | "ORGANIZATION_REQUIRED"
  | "LAST_OWNER"
  | "INVITATION_INVALID"
  | "INVALID_EXPERIENCE_CONTENT"
  | "INVALID_REDIRECT_DESTINATION"
  | "INVALID_CURSOR"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "STORAGE_UNAVAILABLE"
  | "ASSET_STORAGE_UNAVAILABLE"
  | "TOUCHPOINT_AVAILABILITY_UNAVAILABLE"
  | "ANALYTICS_UNAVAILABLE"
  | "GROUP_NAME_TAKEN"
  | "GROUP_CHILD_NAME_TAKEN"
  | "GROUP_TOO_DEEP"
  | "GROUP_CYCLE"
  | "TARGETS_REQUIRED"
  | "ORGANIZATION_LIMIT"
  | "WEBHOOK_UNAVAILABLE"
  | "INVALID_LEAD_DELIVERY_SETTINGS"
  | "TOUCHPOINT_RETIRED"
  | "TOUCHPOINT_SUSPENDED"
  | "TOUCHPOINT_PLAN_EXCLUDED"
  | "EXPERIENCE_LIVE"
  | "TARGET_STILL_LIVE"
  | "TARGETS_OVERRIDDEN"
  | "REPLACE_NOT_CONFIRMED"
  | "ASSET_IN_USE"
  /** Domain audit 2026-10-13: someone else saved the page in between
   * (A2-22); the person is already in the team (A2-11); a webhook URL
   * Kardo will not call (A2-51). */
  | "EXPERIENCE_CHANGED"
  | "ALREADY_MEMBER"
  | "INVALID_WEBHOOK_URL"
  | "OWNER_MUST_TRANSFER"
  | "HANDLE_TAKEN"
  | "HANDLE_RESERVED"
  | "SLUG_TAKEN"
  | "SLUG_RESERVED"
  | "SLUG_INVALID"
  | "SLUG_CHANGE_TOO_SOON"
  | "BUSINESS_SLUG_REQUIRED"
  | "NOT_A_LINK"
  | "INVALID_TOUCHPOINT_KIND"
  /** Kardo pieces (ADR 026): a code that opens nothing for this
   * organization (never says whether it exists elsewhere), a code already
   * used here, too many failed codes, a piece another activation took, and
   * a piece that never changes format. */
  | "PIECE_CODE_INVALID"
  | "PIECE_CODE_USED"
  | "PIECE_CODE_RATE_LIMITED"
  | "PIECE_NOT_CLAIMABLE"
  | "PIECE_KIND_FIXED"
  | "INVALID_OBJECT_STEP"
  | "OBJECT_NOT_REPLACING"
  | "TARGETS_INVALID_PRODUCT"
  | "INVALID_WORKSPACE_PROFILE"
  | "INVALID_QR_DESIGN"
  | "TOUCHPOINT_NOT_QR"
  | "QR_TEMPLATE_LIMIT"
  | "QR_TEMPLATE_IN_USE"
  | "HELP_ASSISTANT_UNAVAILABLE"
  | "ITEM_AVAILABILITY_UNAVAILABLE"
  | "AVAILABILITY_NOT_SUPPORTED"
  | "EXPERIENCE_ARCHIVED"
  | "UNKNOWN_AVAILABILITY_ITEM"
  | "AI_UNAVAILABLE"
  | "CUSTOM_HTML_LIMIT"
  | "CUSTOM_HTML_AI_BUDGET"
  | "PLAN_LIMIT"
  | "PLAN_REQUIRED"
  | "PLAN_SELECTION_OVER_LIMIT"
  | "PLAN_SELECTION_ORGANIZATIONS_REQUIRED"
  | "REAUTHENTICATION_REQUIRED"
  | "ACCOUNT_DELETION_BLOCKED"
  | "INVALID_FISCAL_PROFILE"
  | "BILLING_UNAVAILABLE"
  | "BILLING_CONFLICT"
  | "BILLING_PAYMENT_FAILED"
  | "EXTRAS_NEED_PLAN"
  | "INTERNAL_ERROR";

/** Base class for every error that should reach a customer as a structured,
 * safe API response instead of a generic 500. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;

  constructor(code: ApiErrorCode, statusCode: number, message: string) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

/** The requested workspace, resource or sub-resource is not visible to the
 * current customer, or does not exist at all. Customer API never reveals
 * which case applies. */
export class WorkspaceAccessError extends ApiError {
  constructor(message = "This workspace is not available for this action.") {
    super("WORKSPACE_ACCESS_DENIED", 403, message);
  }
}

/** The resource does not exist inside a workspace the customer *can* access. */
export class NotFoundError extends ApiError {
  constructor(message = "The requested resource was not found.") {
    super("NOT_FOUND", 404, message);
  }
}

/** Generic conflict, e.g. an idempotency key reused in a different context. */
export class ConflictError extends ApiError {
  constructor(code: ApiErrorCode, message: string) {
    super(code, 409, message);
  }
}

/** Draft or published content failed schema, URL or asset-reference checks. */
export class ContentValidationError extends ApiError {
  constructor(
    code:
      | "INVALID_EXPERIENCE_CONTENT"
      | "INVALID_REDIRECT_DESTINATION"
      | "TARGETS_REQUIRED"
      | "INVALID_LEAD_DELIVERY_SETTINGS"
      | "INVALID_WEBHOOK_URL"
      | "HANDLE_RESERVED"
      | "INVALID_TOUCHPOINT_KIND"
      | "INVALID_OBJECT_STEP"
      | "TARGETS_INVALID_PRODUCT"
      | "INVALID_WORKSPACE_PROFILE"
      | "INVALID_QR_DESIGN"
      | "UNKNOWN_AVAILABILITY_ITEM",
    message: string,
  ) {
    super(code, 400, message);
  }
}

/** A workspace invitation token failed to redeem, for any reason (expired,
 * revoked, already accepted, unknown hash, mismatched email). The API
 * deliberately never distinguishes which, so an attacker cannot use the
 * response to enumerate valid emails or tokens. */
export class InvitationInvalidError extends ApiError {
  constructor() {
    super("INVITATION_INVALID", 404, "This invitation is no longer valid.");
  }
}

/** A client-supplied cursor, header or query value failed validation. */
export class InvalidCursorError extends ApiError {
  constructor(message = "The pagination cursor is invalid.") {
    super("INVALID_CURSOR", 400, message);
  }
}

export class RateLimitedError extends ApiError {
  readonly retryAfterSeconds: number;

  constructor(
    retryAfterSeconds: number,
    message = "Too many requests. Try again shortly.",
  ) {
    super("RATE_LIMITED", 429, message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** A downstream dependency (Postgres, the Asset Worker, the Resolver, the
 * Analytics Engine SQL API) did not respond usefully. */
export class UnavailableError extends ApiError {
  constructor(code: ApiErrorCode, message: string) {
    super(code, 503, message);
  }
}

/** Estudio de Experiences, modo HTML: the organization already used its 20
 * Kardo AI generations for the current UTC day. `remainingToday` is always
 * 0 here; the error handler adds it to the response body so the panel can
 * show the same shape it gets back on success. */
export class CustomHtmlLimitError extends ApiError {
  readonly remainingToday = 0;

  constructor(
    message = "Daily limit of Kardo AI HTML generations reached for this organization.",
  ) {
    super("CUSTOM_HTML_LIMIT", 429, message);
  }
}

/** Suscripciones (ADR 019): the workspace's effective plan does not allow
 * this creation (`limit` reached) or feature (`limit` null). The error
 * handler adds `details` to the body so the panel can offer an upgrade. */
export class PlanLimitError extends ApiError {
  readonly details: {
    key: string;
    limit: number | null;
    usage: number | null;
    planCode: string | null;
  };

  constructor(details: PlanLimitError["details"]) {
    super("PLAN_LIMIT", 403, "The current plan does not allow this action.");
    this.details = details;
  }
}

/** ADR 020 §4: the organization has no plan (its trial, subscription or
 * courtesy ended, or it never had one). The panel is read-only: choosing a
 * plan, reading, exporting and invoices still work; every write answers
 * 403 `PLAN_REQUIRED` and the panel offers to choose a plan. */
export class PlanRequiredError extends ApiError {
  readonly accessState: "limited" | "paused";

  constructor(accessState: "limited" | "paused") {
    super(
      "PLAN_REQUIRED",
      403,
      "This organization needs a plan to make changes.",
    );
    this.accessState = accessState;
  }
}
