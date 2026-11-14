import type { AnalyticsSummary } from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";

export type AnalyticsRange = 7 | 30 | 90;

/** The viewer's IANA time zone, so days and hours match the business' clock. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export const analyticsApi = {
  summary: (
    workspaceId: string,
    input: {
      days: AnalyticsRange;
      touchpointId?: string | undefined;
      groupId?: string | undefined;
      /** A9-25: the browser's zone unless the person chose the business'. */
      timeZone?: string | undefined;
    },
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams({
      days: String(input.days),
      tz: input.timeZone ?? browserTimeZone(),
    });
    if (input.touchpointId) query.set("touchpointId", input.touchpointId);
    if (input.groupId) query.set("groupId", input.groupId);
    return apiRequest<AnalyticsSummary>(
      `/v1/workspaces/${workspaceId}/analytics/summary?${query}`,
      { signal },
    );
  },
};
