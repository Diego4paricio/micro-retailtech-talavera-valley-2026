import type { Touchpoint, TouchpointGroup } from "@kardo/contracts";
import type { AnalyticsRange } from "../../api/analytics.js";
import { treeIds } from "../touchpoints/group-tree.js";
import type { OverviewScope, SummaryQuery } from "./summary-store.js";

export const ranges: readonly AnalyticsRange[] = [7, 30, 90];

export const defaultQuery: SummaryQuery = { days: 7, scope: { kind: "all" } };

const storagePrefix = "kardo.overview.filters.v1:";

function isRange(value: unknown): value is AnalyticsRange {
  return value === 7 || value === 30 || value === 90;
}

function isScope(value: unknown): value is OverviewScope {
  if (!value || typeof value !== "object") return false;
  const scope = value as { kind?: unknown; id?: unknown };
  if (scope.kind === "all") return true;
  return (
    (scope.kind === "group" || scope.kind === "touchpoint") &&
    typeof scope.id === "string" &&
    /^[0-9a-fA-F-]{36}$/.test(scope.id)
  );
}

/** Last filters used on this device for the workspace (period + scope). */
export function readFilters(workspaceId: string): SummaryQuery {
  try {
    const raw = window.localStorage.getItem(storagePrefix + workspaceId);
    if (!raw) return defaultQuery;
    const parsed = JSON.parse(raw) as { days?: unknown; scope?: unknown };
    return {
      days: isRange(parsed.days) ? parsed.days : defaultQuery.days,
      scope: isScope(parsed.scope) ? parsed.scope : defaultQuery.scope,
    };
  } catch {
    return defaultQuery;
  }
}

export function writeFilters(workspaceId: string, query: SummaryQuery) {
  try {
    window.localStorage.setItem(
      storagePrefix + workspaceId,
      JSON.stringify(query),
    );
  } catch {
    // Storage unavailable: the filters still apply for this visit.
  }
}

/** Falls back to the whole workspace when the saved group or Touchpoint no
 * longer exists (deleted, retired, or never loaded). */
export function validScope(
  scope: OverviewScope,
  groups: readonly TouchpointGroup[] | null,
  touchpoints: readonly Touchpoint[] | null,
): OverviewScope {
  if (scope.kind === "group")
    return !groups || groups.some((group) => group.id === scope.id)
      ? scope
      : { kind: "all" };
  if (scope.kind === "touchpoint")
    return !touchpoints ||
      touchpoints.some(
        (touchpoint) =>
          touchpoint.id === scope.id && touchpoint.status !== "retired",
      )
      ? scope
      : { kind: "all" };
  return scope;
}

/** Touchpoints the scope covers (retired ones excluded). A group covers its
 * whole tree (groups nest, ADR 021), as the server's numbers do. */
export function touchpointsInScope(
  scope: OverviewScope,
  touchpoints: readonly Touchpoint[],
  groups: readonly Pick<TouchpointGroup, "id" | "name" | "parentId">[] = [],
): Touchpoint[] {
  const live = touchpoints.filter((item) => item.status !== "retired");
  if (scope.kind === "group") {
    const tree = treeIds(groups, scope.id);
    return live.filter(
      (item) => item.groupId !== null && tree.has(item.groupId ?? ""),
    );
  }
  if (scope.kind === "touchpoint")
    return live.filter((item) => item.id === scope.id);
  return live;
}

export function encodeScope(scope: OverviewScope): string {
  return scope.kind === "all" ? "all" : `${scope.kind}:${scope.id}`;
}

export function decodeScope(value: string): OverviewScope {
  const [kind, id] = value.split(":");
  if ((kind === "group" || kind === "touchpoint") && id) return { kind, id };
  return { kind: "all" };
}
