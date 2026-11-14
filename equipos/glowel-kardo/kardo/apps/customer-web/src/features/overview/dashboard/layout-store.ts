import {
  DASHBOARD_COLUMNS,
  DASHBOARD_MAX_WIDGETS,
  type DashboardLayout,
  type DashboardWidget,
} from "@kardo/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { dashboardApi } from "../../../api/dashboard.js";
import { errorMessage } from "../../../lib/api.js";
import { widgetCatalog } from "./catalog.js";
import {
  type ConfigValue,
  type WidgetConfig,
  type WidgetInstance,
  type WidgetType,
  widgetTypes,
} from "./types.js";

export const GRID_COLUMNS = DASHBOARD_COLUMNS;
export const MAX_WIDGETS = DASHBOARD_MAX_WIDGETS;

function place(
  id: string,
  type: WidgetType,
  x: number,
  y: number,
  w: number,
  h: number,
  config: WidgetConfig = {},
): WidgetInstance {
  return {
    id,
    type,
    x,
    y,
    w,
    h,
    config: { ...widgetCatalog[type].defaultConfig, ...config },
  };
}

/** Kardo's starting board: the four headline KPIs, the daily trend and the
 * channel split, activity by day and hour, then rankings and hours. */
export function defaultWidgets(): WidgetInstance[] {
  return [
    place("kpi-taps", "kpi", 0, 0, 3, 2, { metric: "taps" }),
    place("kpi-clicks", "kpi", 3, 0, 3, 2, { metric: "clicks" }),
    place("kpi-leads", "kpi", 6, 0, 3, 2, { metric: "leads" }),
    place("kpi-conversion", "kpi", 9, 0, 3, 2, { metric: "conversionRate" }),
    place("trend", "trend", 0, 2, 8, 5),
    place("channels", "channels", 8, 2, 4, 5),
    place("heatmap", "heatmap", 0, 7, 12, 5),
    place("ranking-touchpoints", "ranking", 0, 12, 6, 5, {
      dimension: "touchpoints",
    }),
    place("ranking-experiences", "ranking", 6, 12, 6, 5, {
      dimension: "experiences",
    }),
    place("hours24", "hours24", 0, 17, 6, 4),
    place("kpi-active", "kpi", 6, 17, 3, 2, { metric: "activeTouchpoints" }),
    place("kpi-reached", "kpi", 9, 17, 3, 2, { metric: "reachedTouchpoints" }),
    place("kpi-interaction", "kpi", 6, 19, 3, 2, { metric: "interactionRate" }),
    place("kpi-peak-hour", "kpi", 9, 19, 3, 2, { metric: "peakHour" }),
  ];
}

const isWidgetType = (value: string): value is WidgetType =>
  (widgetTypes as readonly string[]).includes(value);

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(value)));

/** Keeps only widgets this panel knows, within their size limits, with every
 * option present and valid for its field. */
export function normalizeWidgets(
  raw: readonly DashboardWidget[],
): WidgetInstance[] {
  const seen = new Set<string>();
  const widgets: WidgetInstance[] = [];
  for (const item of raw) {
    if (!isWidgetType(item.type) || seen.has(item.id)) continue;
    seen.add(item.id);
    const definition = widgetCatalog[item.type];
    const w = clamp(item.w, definition.minSize.w, definition.maxSize.w);
    const h = clamp(item.h, definition.minSize.h, definition.maxSize.h);
    const config: WidgetConfig = { ...definition.defaultConfig };
    for (const field of definition.fields) {
      const value: ConfigValue | undefined = item.config[field.key];
      if (field.kind === "toggle" && typeof value === "boolean")
        config[field.key] = value;
      if (
        field.kind === "select" &&
        typeof value === "string" &&
        field.options.some((option) => option.value === value)
      )
        config[field.key] = value;
    }
    widgets.push({
      id: item.id,
      type: item.type,
      w,
      h,
      x: clamp(item.x, 0, GRID_COLUMNS - w),
      y: clamp(item.y, 0, 400),
      config,
    });
    if (widgets.length >= MAX_WIDGETS) break;
  }
  return widgets;
}

export function toLayout(widgets: readonly WidgetInstance[]): DashboardLayout {
  return {
    version: 1,
    widgets: widgets.map(({ id, type, x, y, w, h, config }) => ({
      id,
      type,
      x,
      y,
      w,
      h,
      config,
    })),
  };
}

function newId(type: WidgetType, taken: ReadonlySet<string>): string {
  const slug = type.toLowerCase().slice(0, 24);
  for (;;) {
    const id = `${slug}-${Math.random().toString(36).slice(2, 8)}`;
    if (!taken.has(id)) return id;
  }
}

/** A new widget of `type`, placed on a new row under everything else. */
export function createWidget(
  type: WidgetType,
  existing: readonly WidgetInstance[],
  config: WidgetConfig = {},
): WidgetInstance {
  const definition = widgetCatalog[type];
  const bottom = existing.reduce(
    (max, widget) => Math.max(max, widget.y + widget.h),
    0,
  );
  return {
    id: newId(type, new Set(existing.map((widget) => widget.id))),
    type,
    x: 0,
    y: bottom,
    w: definition.defaultSize.w,
    h: definition.defaultSize.h,
    config: { ...definition.defaultConfig, ...config },
  };
}

// ---------------------------------------------------------------------------
// Persistence: the server keeps each member's board per workspace; a local
// copy paints it instantly on the next visit while the server answers.
// ---------------------------------------------------------------------------

const cachePrefix = "kardo.dashboard.v1:";

function readCache(workspaceId: string): WidgetInstance[] | null {
  try {
    const raw = window.localStorage.getItem(cachePrefix + workspaceId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { widgets?: DashboardWidget[] };
    return Array.isArray(parsed.widgets)
      ? normalizeWidgets(parsed.widgets)
      : null;
  } catch {
    return null;
  }
}

function writeCache(
  workspaceId: string,
  widgets: readonly WidgetInstance[] | null,
) {
  try {
    if (widgets)
      window.localStorage.setItem(
        cachePrefix + workspaceId,
        JSON.stringify(toLayout(widgets)),
      );
    else window.localStorage.removeItem(cachePrefix + workspaceId);
  } catch {
    // Storage unavailable: the server copy still applies.
  }
}

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type DashboardLayoutStore = {
  widgets: WidgetInstance[];
  /** The server answered (or failed); before that `widgets` may be cached. */
  isLoaded: boolean;
  status: SaveStatus;
  error: string | null;
  /** Applies at once and saves shortly after (changes are coalesced). */
  update: (next: WidgetInstance[]) => void;
  /** Back to Kardo's default board (and forget the saved one). */
  reset: () => Promise<void>;
};

const SAVE_DELAY_MS = 700;

export function useDashboardLayout(
  workspaceId: string,
  enabled: boolean,
): DashboardLayoutStore {
  const [widgets, setWidgets] = useState<WidgetInstance[]>(
    () => readCache(workspaceId) ?? defaultWidgets(),
  );
  const [isLoaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<WidgetInstance[] | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const touched = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    dashboardApi.get(workspaceId, controller.signal).then(
      (state) => {
        // A change made while the request was in flight wins.
        if (touched.current) return;
        const next = state.layout
          ? normalizeWidgets(state.layout.widgets)
          : defaultWidgets();
        setWidgets(next);
        writeCache(workspaceId, state.layout ? next : null);
        setLoaded(true);
      },
      (requestError: unknown) => {
        if (controller.signal.aborted) return;
        setError(errorMessage(requestError));
        setLoaded(true);
      },
    );
    return () => controller.abort();
  }, [workspaceId, enabled]);

  const flush = useCallback(async () => {
    const next = pending.current;
    pending.current = null;
    if (!next) return;
    setStatus("saving");
    try {
      await dashboardApi.save(workspaceId, toLayout(next));
      setStatus(pending.current ? "saving" : "saved");
      setError(null);
    } catch (saveError) {
      setStatus("error");
      setError(errorMessage(saveError));
    }
  }, [workspaceId]);

  const update = useCallback(
    (next: WidgetInstance[]) => {
      touched.current = true;
      setWidgets(next);
      writeCache(workspaceId, next);
      pending.current = next;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [workspaceId, flush],
  );

  // Leaving the page never drops the last change.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      const next = pending.current;
      if (next)
        void dashboardApi
          .save(workspaceId, toLayout(next))
          .catch(() => undefined);
    },
    [workspaceId],
  );

  const reset = useCallback(async () => {
    touched.current = true;
    window.clearTimeout(timer.current);
    pending.current = null;
    const next = defaultWidgets();
    setWidgets(next);
    writeCache(workspaceId, null);
    setStatus("saving");
    try {
      await dashboardApi.reset(workspaceId);
      setStatus("saved");
      setError(null);
    } catch (resetError) {
      setStatus("error");
      setError(errorMessage(resetError));
    }
  }, [workspaceId]);

  return { widgets, isLoaded, status, error, update, reset };
}
