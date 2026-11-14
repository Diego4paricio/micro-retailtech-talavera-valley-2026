import {
  ApiErrorSchema,
  type StaffAssignPlan,
  StaffAssignPlanSchema,
  StaffWorkspaceDetailSchema,
  StaffWorkspacePageSchema,
  type StaffWorkspaceQuery,
  StaffWorkspaceQuerySchema,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import type { AppDependencies } from "../http/dependencies.js";
import {
  type WorkspaceParams,
  workspaceParamsSchema,
} from "../http/schemas.js";
import { requireStaffIdentity } from "../http/session.js";

export function registerWorkspaceRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/staff/workspaces",
    {
      schema: {
        tags: ["customers"],
        querystring: StaffWorkspaceQuerySchema,
        response: {
          200: StaffWorkspacePageSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const query = request.query as StaffWorkspaceQuery;
      return deps.workspaceRepository.listWorkspaces(identity.subject, query);
    },
  );

  app.get(
    "/v1/staff/workspaces/:workspaceId",
    {
      schema: {
        tags: ["customers"],
        params: workspaceParamsSchema,
        response: {
          200: StaffWorkspaceDetailSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const params = request.params as WorkspaceParams;
      return deps.workspaceRepository.getWorkspaceDetail(
        identity.subject,
        params.workspaceId,
      );
    },
  );

  app.put(
    "/v1/staff/workspaces/:workspaceId/plan",
    {
      schema: {
        tags: ["commercial"],
        params: workspaceParamsSchema,
        body: StaffAssignPlanSchema,
        response: {
          200: StaffWorkspaceDetailSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const params = request.params as WorkspaceParams;
      return deps.workspaceRepository.assignPlan(
        identity.subject,
        params.workspaceId,
        request.body as StaffAssignPlan,
      );
    },
  );
}
