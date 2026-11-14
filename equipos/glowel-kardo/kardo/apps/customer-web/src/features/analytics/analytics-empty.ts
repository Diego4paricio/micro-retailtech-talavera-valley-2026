import type {
  AnalyticsSummary,
  ExperienceSummary,
  Touchpoint,
} from "@kardo/contracts";

/**
 * A9-29: which empty state, if any, belongs above the numbers right now.
 * `null` means there is something to show (accesses, clicks or requests in
 * the period) — the normal case once a business is running.
 */
export type AnalyticsEmptyKind =
  /** Nothing is published anywhere yet: no QR, etiqueta or link opens a page. */
  | "unpublished"
  /** Something is published, but the chosen period had no visits. */
  | "noVisits"
  | null;

export function analyticsEmptyKind(
  data: Pick<AnalyticsSummary, "source" | "totals"> | null,
  touchpoints: readonly Pick<Touchpoint, "status">[],
  experiences: readonly Pick<ExperienceSummary, "liveTouchpointCount">[],
): AnalyticsEmptyKind {
  if (!data || data.source === "unavailable") return null;
  const { taps, clicks, leads } = data.totals;
  if (taps > 0 || clicks > 0 || leads > 0) return null;
  const published =
    touchpoints.some((item) => item.status === "active") ||
    experiences.some((item) => (item.liveTouchpointCount ?? 0) > 0);
  return published ? "noVisits" : "unpublished";
}
