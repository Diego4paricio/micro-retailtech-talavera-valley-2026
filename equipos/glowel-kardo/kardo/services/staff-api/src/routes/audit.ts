import {
  ApiErrorSchema,
  StaffAuditPageSchema,
  type StaffAuditQuery,
  StaffAuditQuerySchema,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import type { AppDependencies } from "../http/dependencies.js";
import { requireStaffIdentity } from "../http/session.js";

export function registerAuditRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/staff/audit",
    {
      schema: {
        tags: ["audit"],
        querystring: StaffAuditQuerySchema,
        response: {
          200: StaffAuditPageSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const query = request.query as StaffAuditQuery;
      return deps.auditRepository.listAuditEvents(identity.subject, query);
    },
  );
}
