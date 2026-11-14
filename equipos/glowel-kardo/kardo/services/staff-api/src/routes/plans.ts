import {
  ApiErrorSchema,
  StaffPlanListSchema,
  StaffPlanSchema,
  type StaffUpsertPlan,
  StaffUpsertPlanSchema,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import type { AppDependencies } from "../http/dependencies.js";
import { type PlanParams, planParamsSchema } from "../http/schemas.js";
import { requireStaffIdentity } from "../http/session.js";

export function registerPlanRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/staff/plans",
    {
      schema: {
        tags: ["commercial"],
        response: {
          200: StaffPlanListSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      return deps.planRepository.listPlans(identity.subject);
    },
  );

  app.post(
    "/v1/staff/plans",
    {
      schema: {
        tags: ["commercial"],
        body: StaffUpsertPlanSchema,
        response: {
          201: StaffPlanSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireStaffIdentity(request, deps);
      const plan = await deps.planRepository.createPlan(
        identity.subject,
        request.body as StaffUpsertPlan,
      );
      return reply.code(201).send(plan);
    },
  );

  app.put(
    "/v1/staff/plans/:planId",
    {
      schema: {
        tags: ["commercial"],
        params: planParamsSchema,
        body: StaffUpsertPlanSchema,
        response: {
          200: StaffPlanSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const params = request.params as PlanParams;
      return deps.planRepository.updatePlan(
        identity.subject,
        params.planId,
        request.body as StaffUpsertPlan,
      );
    },
  );
}
