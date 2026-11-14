import type { VisitsByTouchpoint } from "@kardo/billing";
import {
  type AnalyticsEngineClient,
  fetchTapClickAggregates,
} from "../analytics-engine.js";

/**
 * Visits per Touchpoint in the last 30 days, from Analytics Engine, for the
 * downgrade default rule and the «Elige qué sigue activo» list (ADR 023).
 * Null without Analytics Engine: the rule then ranks by recent activity.
 */
export function createPlanVisits(input: {
  client: AnalyticsEngineClient | null;
  dataset: string;
  environment: string;
}): VisitsByTouchpoint | null {
  const client = input.client;
  if (!client) return null;
  return async ({ publicIds }) => {
    const aggregates = await fetchTapClickAggregates({
      client,
      dataset: input.dataset,
      environment: input.environment,
      days: 30,
      publicIds,
    });
    const visits = new Map<string, number>();
    for (const [publicId, aggregate] of aggregates.perTouchpoint)
      visits.set(publicId, aggregate.taps);
    return visits;
  };
}
