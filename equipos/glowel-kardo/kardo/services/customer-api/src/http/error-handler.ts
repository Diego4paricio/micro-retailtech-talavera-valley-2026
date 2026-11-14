import type { ApiError as ApiErrorBody } from "@kardo/contracts";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { errors as joseErrors } from "jose";
import {
  CustomerSessionError,
  SecondFactorRequiredError,
} from "../customer-session.js";
import {
  ApiError,
  CustomHtmlLimitError,
  PlanLimitError,
  PlanRequiredError,
  RateLimitedError,
} from "../errors.js";
import { applyRetryAfter } from "../rate-limit.js";

/**
 * The single place that turns a thrown error into an HTTP response. Before
 * this, individual route handlers each formatted their own error responses,
 * and the fallback case answered every unrecognized error — including a
 * genuine bug — with `401 AUTH_REQUIRED`, which silently hid real failures
 * behind an authentication error. The rules here are, in order:
 *
 *   1. `CustomerSessionError` or any `jose` verification error → 401
 *      `AUTH_REQUIRED` (`MFA_REQUIRED` when only the second factor is
 *      missing). This is the *only* path to 401.
 *   2. Any of this service's own `ApiError` subclasses → their own declared
 *      status and code (403 `WORKSPACE_ACCESS_DENIED`, 404 `NOT_FOUND`, 409
 *      `CONFLICT`/`LAST_OWNER`/..., 400 `INVALID_EXPERIENCE_CONTENT`/..., 429
 *      `RATE_LIMITED`, 503 for a downstream dependency).
 *   3. A Fastify schema-validation failure → 400 `VALIDATION_FAILED`, with no
 *      echo of the offending request data.
 *   4. Anything else is unknown: it is logged in full server-side and the
 *      customer gets a generic 500 `INTERNAL_ERROR` with no internal detail.
 *
 * Every response body is an `ApiError` shape; message text is always a safe,
 * generic sentence — the Customer App renders copy from `code`, not from
 * `message`.
 */
export function customerApiErrorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const requestId = request.id;

  // The session is real but stops at the password: the panel answers with
  // its "code from your app" step instead of signing out.
  if (error instanceof SecondFactorRequiredError) {
    void send(
      reply,
      401,
      "MFA_REQUIRED",
      "This account requires its second factor.",
      requestId,
    );
    return;
  }

  if (
    error instanceof CustomerSessionError ||
    error instanceof joseErrors.JOSEError
  ) {
    void send(
      reply,
      401,
      "AUTH_REQUIRED",
      "A verified customer session is required.",
      requestId,
    );
    return;
  }

  if (error instanceof RateLimitedError) {
    applyRetryAfter(reply, error.retryAfterSeconds);
    void send(reply, error.statusCode, error.code, error.message, requestId);
    return;
  }

  // Carries one extra field (`remainingToday`) the panel needs to show the
  // same shape it gets back on a successful generation.
  if (error instanceof CustomHtmlLimitError) {
    void send(reply, error.statusCode, error.code, error.message, requestId, {
      remainingToday: error.remainingToday,
    });
    return;
  }

  // Suscripciones (ADR 019): which limit was hit, so the panel can offer
  // the plan that lifts it.
  if (error instanceof PlanLimitError) {
    void send(reply, error.statusCode, error.code, error.message, requestId, {
      ...error.details,
    });
    return;
  }

  // ADR 020: read-only panel; the state tells the panel what to say.
  if (error instanceof PlanRequiredError) {
    void send(reply, error.statusCode, error.code, error.message, requestId, {
      accessState: error.accessState,
    });
    return;
  }

  if (error instanceof ApiError) {
    // A dependency failure (Stripe, Postgres, the Resolver…) behind a 5xx
    // must leave a trace, or a "billing unavailable" is undebuggable
    // (security review 2026-10).
    if (error.statusCode >= 500 && error.cause !== undefined) {
      request.log.warn(
        { err: loggableError(error.cause), code: error.code },
        "Dependency failure behind an API error",
      );
    }
    void send(reply, error.statusCode, error.code, error.message, requestId);
    return;
  }

  if (isFastifyValidationError(error)) {
    void send(
      reply,
      400,
      "VALIDATION_FAILED",
      "The request did not match the expected shape.",
      requestId,
    );
    return;
  }

  request.log.error(
    { err: loggableError(error) },
    "Unhandled error in the Customer API",
  );
  void send(
    reply,
    500,
    "INTERNAL_ERROR",
    "Something went wrong. Try again shortly.",
    requestId,
  );
}

function isFastifyValidationError(error: FastifyError | Error): boolean {
  return (
    "validation" in error &&
    Array.isArray((error as FastifyError).validation) &&
    (error as FastifyError).validation !== undefined
  );
}

function send(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  requestId: string,
  extra?: Record<string, unknown>,
): FastifyReply {
  const body: ApiErrorBody & Record<string, unknown> = {
    code,
    message,
    requestId,
    ...extra,
  };
  return reply.code(statusCode).send(body);
}

/**
 * What a log keeps of an error: name, message, code and stack. Postgres
 * puts row values in `detail` (a duplicate key names the email, for
 * instance) and its query parameters elsewhere; none of those reach the
 * logs (security review 2026-10).
 */
export function loggableError(error: unknown): {
  name: string;
  message: string;
  code?: string;
  stack?: string;
} {
  if (!(error instanceof Error)) {
    return { name: "Error", message: String(error).slice(0, 500) };
  }
  const code = (error as { code?: unknown }).code;
  return {
    name: error.name,
    message: error.message.slice(0, 500),
    ...(typeof code === "string" ? { code } : {}),
    ...(error.stack ? { stack: error.stack } : {}),
  };
}
