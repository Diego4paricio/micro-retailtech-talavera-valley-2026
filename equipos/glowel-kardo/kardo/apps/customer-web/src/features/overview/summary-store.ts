import type { AnalyticsSummary } from "@kardo/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { type AnalyticsRange, analyticsApi } from "../../api/analytics.js";
import { errorMessage } from "../../lib/api.js";

/**
 * The Resumen's data layer: an in-memory, stale-while-revalidate cache of
 * analytics summaries shared by the page, its filters and the workspace shell.
 *
 * - Coming back to Resumen (or to a filter already seen) paints instantly
 *   from memory and refreshes in the background.
 * - Concurrent readers of the same key share one request.
 * - The shell prefetches the default view while it is still loading the
 *   workspace list, and the filters prefetch on hover, so most changes land
 *   with data already in hand.
 *
 * Memory only (never storage): summaries are business data and must not
 * outlive the tab or leak across accounts on a shared device.
 */

export type OverviewScope =
  | { kind: "all" }
  | { kind: "group"; id: string }
  | { kind: "touchpoint"; id: string };

export type SummaryQuery = {
  days: AnalyticsRange;
  scope: OverviewScope;
  /** A9-25: the zone to bucket days/hours by (browser or business). */
  timeZone?: string;
};

type Entry = {
  data: AnalyticsSummary | null;
  /** When `data` was received (ms). */
  at: number;
  pending: Promise<AnalyticsSummary> | null;
};

/** Younger than this, a cached summary is shown without refetching. */
const FRESH_MS = 30_000;
const MAX_ENTRIES = 40;
const entries = new Map<string, Entry>();

export function scopeKey(scope: OverviewScope): string {
  return scope.kind === "all" ? "all" : `${scope.kind}:${scope.id}`;
}

export function summaryKey(workspaceId: string, query: SummaryQuery): string {
  return `${workspaceId}|${query.days}|${scopeKey(query.scope)}|${query.timeZone ?? ""}`;
}

function remember(key: string, entry: Entry) {
  entries.delete(key);
  entries.set(key, entry);
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

function request(workspaceId: string, query: SummaryQuery) {
  const { scope, days, timeZone } = query;
  return analyticsApi.summary(
    workspaceId,
    scope.kind === "group"
      ? { days, groupId: scope.id, timeZone }
      : scope.kind === "touchpoint"
        ? { days, touchpointId: scope.id, timeZone }
        : { days, timeZone },
  );
}

/** Starts (or joins) the request for `query`; resolves with fresh data. */
export function loadSummary(
  workspaceId: string,
  query: SummaryQuery,
): Promise<AnalyticsSummary> {
  const key = summaryKey(workspaceId, query);
  const existing = entries.get(key);
  if (existing?.pending) return existing.pending;
  const pending = request(workspaceId, query).then(
    (data) => {
      remember(key, { data, at: Date.now(), pending: null });
      return data;
    },
    (error: unknown) => {
      const current = entries.get(key);
      if (current?.pending === pending) {
        if (current.data) remember(key, { ...current, pending: null });
        else entries.delete(key);
      }
      throw error;
    },
  );
  remember(key, {
    data: existing?.data ?? null,
    at: existing?.at ?? 0,
    pending,
  });
  return pending;
}

/** Warms the cache for a view the person is likely to open next. */
export function prefetchSummary(workspaceId: string, query: SummaryQuery) {
  const entry = entries.get(summaryKey(workspaceId, query));
  if (entry?.pending || (entry?.data && Date.now() - entry.at < FRESH_MS))
    return;
  loadSummary(workspaceId, query).catch(() => undefined);
}

export function peekSummary(
  workspaceId: string,
  query: SummaryQuery,
): { data: AnalyticsSummary; at: number } | null {
  const entry = entries.get(summaryKey(workspaceId, query));
  return entry?.data ? { data: entry.data, at: entry.at } : null;
}

export type OverviewSummary = {
  data: AnalyticsSummary | null;
  /** No data to show yet for this workspace (first paint). */
  isLoading: boolean;
  /** Showing data while a newer answer loads (filter change, refresh). */
  isRefreshing: boolean;
  /** `data` belongs to another filter and is shown only as a placeholder. */
  isStale: boolean;
  error: string | null;
  reload: () => void;
};

/**
 * Summary for the current filters. While a new filter loads it keeps the
 * previous answer on screen (flagged `isStale`) instead of collapsing the
 * layout into skeletons.
 */
export function useOverviewSummary(
  workspaceId: string,
  query: SummaryQuery,
  enabled: boolean,
): OverviewSummary {
  const key = summaryKey(workspaceId, query);
  const [state, setState] = useState<{
    /** The filter `data` belongs to. */
    dataKey: string | null;
    data: AnalyticsSummary | null;
    error: string | null;
    loading: boolean;
  }>(() => {
    const hit = enabled ? peekSummary(workspaceId, query) : null;
    return {
      dataKey: hit ? key : null,
      data: hit?.data ?? null,
      error: null,
      loading: enabled && (!hit || Date.now() - hit.at >= FRESH_MS),
    };
  });
  const [attempt, setAttempt] = useState(0);
  const force = useRef(false);
  const queryRef = useRef(query);
  queryRef.current = query;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` captures every input of `query`; `attempt` forces a refetch
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const hit = peekSummary(workspaceId, queryRef.current);
    const fresh =
      !force.current && hit !== null && Date.now() - hit.at < FRESH_MS;
    force.current = false;
    setState((current) =>
      hit
        ? { dataKey: key, data: hit.data, error: null, loading: !fresh }
        : { ...current, error: null, loading: true },
    );
    if (fresh) return;
    loadSummary(workspaceId, queryRef.current).then(
      (data) => {
        if (active)
          setState({ dataKey: key, data, error: null, loading: false });
      },
      (error: unknown) => {
        if (active)
          setState((current) => ({
            ...current,
            error: errorMessage(error),
            loading: false,
          }));
      },
    );
    return () => {
      active = false;
    };
  }, [enabled, key, workspaceId, attempt]);

  const reload = useCallback(() => {
    force.current = true;
    setAttempt((value) => value + 1);
  }, []);

  const isCurrent = state.dataKey === key;
  // A failed filter change must not present another filter's numbers as its own.
  const data = state.error && !isCurrent ? null : state.data;
  return {
    data,
    isLoading: enabled && !data && !state.error,
    isRefreshing: enabled && Boolean(data) && (state.loading || !isCurrent),
    isStale: Boolean(data) && !isCurrent,
    error: state.error,
    reload,
  };
}
