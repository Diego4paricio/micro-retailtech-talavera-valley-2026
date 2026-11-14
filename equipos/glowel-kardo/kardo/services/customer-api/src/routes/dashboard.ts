import {
  ApiErrorSchema,
  DashboardLayoutStateSchema,
  type SaveDashboardLayout,
  SaveDashboardLayoutSchema,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import type { AppDependencies } from "../http/dependencies.js";
import {
  type WorkspaceParams,
  workspaceParamsSchema,
} from "../http/schemas.js";
import { requireSession } from "../http/session.js";

/** The signed-in member's own Resumen layout (widgets, positions, options). */
export function registerDashboardRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/workspaces/:workspaceId/dashboard",
    {
      schema: {
        tags: ["analytics"],
        summary: "Read my Resumen layout for this workspace",
        params: workspaceParamsSchema,
        response: {
          200: DashboardLayoutStateSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      return deps.dashboardRepository.getLayout(identity, params.workspaceId);
    },
  );

  app.put(
    "/v1/workspaces/:workspaceId/dashboard",
    {
      bodyLimit: 48 * 1024,
      schema: {
        tags: ["analytics"],
        summary: "Save my Resumen layout for this workspace",
        params: workspaceParamsSchema,
        body: SaveDashboardLayoutSchema,
        response: {
          200: DashboardLayoutStateSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      const body = request.body as SaveDashboardLayout;
      return deps.dashboardRepository.saveLayout(
        identity,
        params.workspaceId,
        body.layout,
      );
    },
  );

  app.delete(
    "/v1/workspaces/:workspaceId/dashboard",
    {
      schema: {
        tags: ["analytics"],
        summary: "Go back to the default Resumen layout",
        params: workspaceParamsSchema,
        response: {
          204: { type: "null" },
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      await deps.dashboardRepository.resetLayout(identity, params.workspaceId);
      return reply.code(204).send();
    },
  );
}
