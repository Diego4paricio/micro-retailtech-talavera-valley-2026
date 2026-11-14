import { ApiErrorSchema, StaffMemberListSchema } from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import type { AppDependencies } from "../http/dependencies.js";
import { requireStaffIdentity } from "../http/session.js";

export function registerStaffMemberRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/staff/staff-members",
    {
      schema: {
        tags: ["staff"],
        response: {
          200: StaffMemberListSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      return deps.staffMemberRepository.listStaffMembers(identity.subject);
    },
  );
}
