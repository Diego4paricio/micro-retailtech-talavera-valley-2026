import {
  ApiErrorSchema,
  type StaffSuspendTouchpoint,
  StaffSuspendTouchpointSchema,
  StaffTouchpointDetailSchema,
  StaffTouchpointPageSchema,
  type StaffTouchpointQuery,
  StaffTouchpointQuerySchema,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import type { AppDependencies } from "../http/dependencies.js";
import { StaffDependencyError } from "../http/errors.js";
import {
  type TouchpointParams,
  touchpointParamsSchema,
} from "../http/schemas.js";
import { requireStaffIdentity } from "../http/session.js";

export function registerTouchpointRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/staff/touchpoints",
    {
      schema: {
        tags: ["touchpoints"],
        querystring: StaffTouchpointQuerySchema,
        response: {
          200: StaffTouchpointPageSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const query = request.query as StaffTouchpointQuery;
      return deps.touchpointRepository.listTouchpoints(identity.subject, query);
    },
  );

  app.get(
    "/v1/staff/touchpoints/:touchpointId",
    {
      schema: {
        tags: ["touchpoints"],
        params: touchpointParamsSchema,
        response: {
          200: StaffTouchpointDetailSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const params = request.params as TouchpointParams;
      return deps.touchpointRepository.getTouchpointDetail(
        identity.subject,
        params.touchpointId,
      );
    },
  );

  app.post(
    "/v1/staff/touchpoints/:touchpointId/suspension",
    {
      schema: {
        tags: ["touchpoints"],
        params: touchpointParamsSchema,
        body: StaffSuspendTouchpointSchema,
        response: {
          200: StaffTouchpointDetailSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      if (!deps.resolverSuspension) {
        throw new StaffDependencyError(
          "Touchpoint suspension is not configured.",
        );
      }
      const params = request.params as TouchpointParams;
      return deps.touchpointRepository.suspendTouchpoint(
        identity.subject,
        params.touchpointId,
        request.body as StaffSuspendTouchpoint,
        deps.resolverSuspension,
      );
    },
  );

  app.delete(
    "/v1/staff/touchpoints/:touchpointId/suspension",
    {
      schema: {
        tags: ["touchpoints"],
        params: touchpointParamsSchema,
        response: {
          200: StaffTouchpointDetailSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      if (!deps.resolverSuspension) {
        throw new StaffDependencyError(
          "Touchpoint suspension is not configured.",
        );
      }
      const params = request.params as TouchpointParams;
      return deps.touchpointRepository.unsuspendTouchpoint(
        identity.subject,
        params.touchpointId,
        deps.resolverSuspension,
      );
    },
  );
}
