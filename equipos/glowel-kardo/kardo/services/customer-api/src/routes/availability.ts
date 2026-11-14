import {
  ApiErrorSchema,
  AvailabilityExperienceSchema,
  AvailabilityOverviewSchema,
  type SaveItemAvailability,
  SaveItemAvailabilitySchema,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import type { AppDependencies } from "../http/dependencies.js";
import {
  type WorkspaceParams,
  workspaceExperienceParamsSchema,
  workspaceParamsSchema,
} from "../http/schemas.js";
import { requireSession } from "../http/session.js";

type ExperienceAvailabilityParams = {
  workspaceId: string;
  experienceId: string;
};

/** Disponibilidad: live state of Menu and Catalog items, outside versions. */
export function registerAvailabilityRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/workspaces/:workspaceId/availability",
    {
      schema: {
        tags: ["experiences"],
        summary: "Read the live availability of every Menu and Catalog item",
        params: workspaceParamsSchema,
        response: {
          200: AvailabilityOverviewSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      return deps.itemAvailabilityRepository.listAvailability(
        identity,
        params.workspaceId,
      );
    },
  );

  app.put(
    "/v1/workspaces/:workspaceId/experiences/:experienceId/availability",
    {
      bodyLimit: 32 * 1024,
      schema: {
        tags: ["experiences"],
        summary:
          "Change the live availability of items (no version, no publishing)",
        params: workspaceExperienceParamsSchema,
        body: SaveItemAvailabilitySchema,
        response: {
          200: AvailabilityExperienceSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as ExperienceAvailabilityParams;
      const body = request.body as SaveItemAvailability;
      return deps.itemAvailabilityRepository.saveAvailability(
        identity,
        params.workspaceId,
        params.experienceId,
        body.items,
      );
    },
  );
}
