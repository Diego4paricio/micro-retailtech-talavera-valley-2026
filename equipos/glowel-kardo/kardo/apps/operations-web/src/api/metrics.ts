import type { StaffMetricsOverview } from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";

export type MetricsRange = 7 | 30 | 90;

export const metricsApi = {
  overview: (days: MetricsRange, signal?: AbortSignal) =>
    apiRequest<StaffMetricsOverview>(
      `/v1/staff/metrics/overview?days=${days}`,
      {
        signal,
      },
    ),
};
