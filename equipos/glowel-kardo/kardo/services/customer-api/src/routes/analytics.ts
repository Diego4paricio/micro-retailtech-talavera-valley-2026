import { AnalyticsSummarySchema, ApiErrorSchema } from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import type { AnalyticsDays } from "../analytics-engine.js";
import type { AppDependencies } from "../http/dependencies.js";
import {
  type WorkspaceParams,
  workspaceParamsSchema,
} from "../http/schemas.js";
import { requireSession } from "../http/session.js";
import { resolveTimeZone } from "../timezone.js";

const analyticsQuerystringSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    days: { type: "string", enum: ["7", "30", "90"], default: "7" },
    touchpointId: { type: "string", format: "uuid" },
    groupId: { type: "string", format: "uuid" },
    tz: { type: "string", maxLength: 64 },
  },
} as const;

type AnalyticsQuerystring = {
  days?: "7" | "30" | "90";
  touchpointId?: string;
  groupId?: string;
  tz?: string;
};

export function registerAnalyticsRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/workspaces/:workspaceId/analytics/summary",
    {
      schema: {
        tags: ["analytics"],
        summary: "Read privacy-preserving aggregate Tap metrics",
        params: workspaceParamsSchema,
        querystring: analyticsQuerystringSchema,
        response: {
          200: AnalyticsSummarySchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      const query = request.query as AnalyticsQuerystring;
      const days = Number(query.days ?? "7") as AnalyticsDays;
      return deps.analyticsRepository.getSummary(identity, params.workspaceId, {
        days,
        timeZone: resolveTimeZone(query.tz),
        ...(query.touchpointId ? { touchpointId: query.touchpointId } : {}),
        ...(query.groupId ? { groupId: query.groupId } : {}),
      });
    },
  );
}
