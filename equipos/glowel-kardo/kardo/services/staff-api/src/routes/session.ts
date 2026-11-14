import {
  ApiErrorSchema,
  StaffDiagnosticsSchema,
  StaffSessionSchema,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import type { AppDependencies } from "../http/dependencies.js";

export function registerSessionRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/staff/session",
    {
      schema: {
        tags: ["staff-auth"],
        response: {
          200: StaffSessionSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await deps.sessionVerifier.verify(
        request.headers.authorization,
      );
      return deps.sessionRepository.getActiveStaffSession(
        identity.subject,
        identity.email,
      );
    },
  );

  app.get(
    "/v1/staff/diagnostics",
    {
      schema: {
        tags: ["operations"],
        response: {
          200: StaffDiagnosticsSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await deps.sessionVerifier.verify(
        request.headers.authorization,
      );
      await deps.sessionRepository.getActiveStaffSession(
        identity.subject,
        identity.email,
      );
      return deps.sessionRepository.readDiagnostics(identity.subject);
    },
  );
}
