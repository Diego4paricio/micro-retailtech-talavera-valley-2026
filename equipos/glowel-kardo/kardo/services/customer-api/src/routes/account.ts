import {
  AccountDeletedSchema,
  AccountDeletionCheckSchema,
  AccountExportSchema,
  AccountSessionListSchema,
  AccountSignInListSchema,
  ApiErrorSchema,
  ClosedSessionsSchema,
  DeleteAccountSchema,
  SIGN_IN_HISTORY_DAYS,
} from "@kardo/contracts";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { ApiError } from "../errors.js";
import type { AppDependencies } from "../http/dependencies.js";
import { requireSession } from "../http/session.js";

const SessionParamsSchema = Type.Object(
  { sessionId: Type.String({ format: "uuid" }) },
  { additionalProperties: false },
);

/** Tu cuenta → Seguridad (ADR 023): sessions and sign-in history. */
export function registerAccountRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/me/sessions",
    {
      schema: {
        tags: ["auth"],
        summary: "List the current customer's active sessions",
        response: { 200: AccountSessionListSchema, 401: ApiErrorSchema },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      return { items: await deps.accountRepository.listSessions(identity) };
    },
  );

  app.delete(
    "/v1/me/sessions/:sessionId",
    {
      schema: {
        tags: ["auth"],
        summary: "Close one of the current customer's sessions",
        params: SessionParamsSchema,
        response: { 200: ClosedSessionsSchema, 401: ApiErrorSchema },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      const { sessionId } = request.params as { sessionId: string };
      const closed = await deps.accountRepository.closeSession(
        identity,
        sessionId,
      );
      // Its access token stops opening this API now, not in 10 seconds.
      if (closed) deps.sessionStates.forget(sessionId);
      return { closed };
    },
  );

  app.post(
    "/v1/me/sessions/close-others",
    {
      schema: {
        tags: ["auth"],
        summary: "Close every session but this one",
        response: { 200: ClosedSessionsSchema, 401: ApiErrorSchema },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      const closed = await deps.accountRepository.closeOtherSessions(identity);
      for (const sessionId of closed) deps.sessionStates.forget(sessionId);
      return { closed: closed.length };
    },
  );

  app.get(
    "/v1/me/sign-ins",
    {
      schema: {
        tags: ["auth"],
        summary: "Sign-in history of the last 90 days",
        response: { 200: AccountSignInListSchema, 401: ApiErrorSchema },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      return {
        items: await deps.accountRepository.listSignIns(identity),
        days: SIGN_IN_HISTORY_DAYS,
      };
    },
  );

  // Tus datos (ADR 023): exportar mis datos y borrar mi cuenta.
  app.get(
    "/v1/me/export",
    {
      schema: {
        tags: ["auth"],
        summary: "Download the current customer's own data",
        response: { 200: AccountExportSchema, 401: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      const data = await deps.accountRepository.exportData(identity);
      reply.header(
        "content-disposition",
        `attachment; filename="kardo-mis-datos-${data.exportedAt.slice(0, 10)}.json"`,
      );
      return data;
    },
  );

  app.get(
    "/v1/me/deletion",
    {
      schema: {
        tags: ["auth"],
        summary: "What deleting the account needs and takes with it",
        response: { 200: AccountDeletionCheckSchema, 401: ApiErrorSchema },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      return deps.accountRepository.deletionCheck(identity);
    },
  );

  app.delete(
    "/v1/me",
    {
      schema: {
        tags: ["auth"],
        summary: "Delete the current customer's account",
        body: DeleteAccountSchema,
        response: {
          200: AccountDeletedSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      const result = await deps.accountRepository.deleteAccount(identity);
      if (result.status === "reauthenticate")
        throw new ApiError(
          "REAUTHENTICATION_REQUIRED",
          403,
          "Sign in again before deleting the account.",
        );
      if (result.status === "blocked")
        throw new ApiError(
          "ACCOUNT_DELETION_BLOCKED",
          409,
          "Something has to be solved before deleting the account.",
        );
      if (identity.sessionId) deps.sessionStates.forget(identity.sessionId);
      // QR pages retired and files removed now, not at the next tick.
      if (result.erased.length > 0 && deps.deletionCleanup)
        await deps
          .deletionCleanup()
          .catch((error: unknown) =>
            request.log.warn(
              { err: error },
              "Account deletion cleanup stays queued for the hourly task.",
            ),
          );
      return { deleted: true as const, erasedWorkspaces: result.erased.length };
    },
  );
}
