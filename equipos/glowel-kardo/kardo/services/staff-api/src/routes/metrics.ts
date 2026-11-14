import {
  ApiErrorSchema,
  StaffMetricsOverviewSchema,
  type StaffMetricsQuery,
  StaffMetricsQuerySchema,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import type { AnalyticsDays } from "../clients/analytics-engine.js";
import type { AppDependencies } from "../http/dependencies.js";
import { requireStaffIdentity } from "../http/session.js";

export function registerMetricsRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/staff/metrics/overview",
    {
      schema: {
        tags: ["operations"],
        querystring: StaffMetricsQuerySchema,
        response: {
          200: StaffMetricsOverviewSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireStaffIdentity(request, deps);
      const query = request.query as StaffMetricsQuery;
      const days: AnalyticsDays = query.days ?? 30;
      return deps.metricsRepository.getOverview(
        identity.subject,
        days,
        (message, error) => request.log.warn({ err: error }, message),
      );
    },
  );
}
