import type { ApiError as ApiErrorBody } from "@kardo/contracts";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { errors as joseErrors } from "jose";
import { StaffApiError, StaffRateLimitedError } from "./errors.js";

/**
 * The single place that turns a thrown error into an HTTP response for the
 * Staff API. The rules, in order:
 *
 *   1. A `jose` verification error (bad signature, expired, wrong
 *      issuer/audience) that escaped the session verifier → 401
 *      `STAFF_SESSION_REQUIRED`.
 *   2. Any `StaffApiError` subclass → its own declared status and code (401
 *      session, 403 MFA/access/permission, 404 not found, 400 validation,
 *      409 conflict, 503 dependency/storage unavailable).
 *   3. A Fastify schema-validation failure → 400 `STAFF_VALIDATION_FAILED`,
 *      with no echo of the offending request data.
 *   4. Anything else is unknown: logged in full server-side, generic 500
 *      `STAFF_INTERNAL_ERROR` to the client.
 */
export function staffApiErrorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const requestId = request.id;

  if (error instanceof joseErrors.JOSEError) {
    void send(
      reply,
      401,
      "STAFF_SESSION_REQUIRED",
      "A verified staff session is required.",
      requestId,
    );
    return;
  }

  if (error instanceof StaffRateLimitedError) {
    reply.header("retry-after", String(error.retryAfterSeconds));
    void send(reply, error.statusCode, error.code, error.message, requestId);
    return;
  }

  if (error instanceof StaffApiError) {
    void send(reply, error.statusCode, error.code, error.message, requestId);
    return;
  }

  if (isFastifyValidationError(error)) {
    void send(
      reply,
      400,
      "STAFF_VALIDATION_FAILED",
      "The request did not match the expected shape.",
      requestId,
    );
    return;
  }

  request.log.error({ err: error }, "Unhandled error in the Staff API");
  void send(
    reply,
    500,
    "STAFF_INTERNAL_ERROR",
    "Operations could not process this request.",
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
): FastifyReply {
  const body: ApiErrorBody = { code, message, requestId };
  return reply.code(statusCode).send(body);
}
