import type {
  AnalyticsSummary,
  DashboardWidget,
  ExperienceSummary,
  Touchpoint,
  TouchpointGroup,
} from "@kardo/contracts";
import type { ComponentType } from "react";
import type { AnalyticsRange } from "../../../api/analytics.js";
import type { OverviewScope } from "../summary-store.js";

/**
 * Shared contract of the Resumen dashboard. The grid (edit mode, gallery,
 * editor) and the widget renderers both depend on this file only, so they
 * can evolve independently.
 */

export const widgetTypes = [
  "kpi",
  "trend",
  "channels",
  "channelTrend",
  "heatmap",
  "hours24",
  "hourOfDay",
  "weekday",
  "ranking",
  "funnel",
  "silent",
  "experienceTypes",
  "channelInteraction",
] as const;
export type WidgetType = (typeof widgetTypes)[number];

export type ConfigValue = string | number | boolean;
export type WidgetConfig = Record<string, ConfigValue>;

/** One widget on the board: grid position (12 columns), size and options. */
export type WidgetInstance = Omit<DashboardWidget, "type" | "config"> & {
  type: WidgetType;
  config: WidgetConfig;
};

export type WidgetCategory =
  | "indicadores"
  | "tendencias"
  | "canales"
  | "actividad"
  | "rendimiento";

export const categoryLabels: Record<WidgetCategory, string> = {
  indicadores: "Indicadores",
  tendencias: "Tendencias",
  canales: "Canales",
  actividad: "Actividad",
  rendimiento: "QR, etiquetas y páginas",
};

export type ConfigField =
  | {
      key: string;
      label: string;
      kind: "select";
      options: readonly { value: string; label: string }[];
    }
  | { key: string; label: string; kind: "toggle"; hint?: string };

export type GridSize = { w: number; h: number };

export type WidgetDefinition = {
  type: WidgetType;
  /** Name in the gallery. */
  name: string;
  /** The question it answers, shown in the gallery and editor. */
  description: string;
  /** How to read it, for the (i) help block on the card. */
  help: string;
  category: WidgetCategory;
  /**
   * `titled`: the grid draws a card with the title and menu around the body.
   * `bare`: the renderer is the whole card (KPI cards); the grid only adds
   * the menu and, in edit mode, the drag handle, floating over it.
   */
  frame: "titled" | "bare";
  defaultSize: GridSize;
  minSize: GridSize;
  maxSize: GridSize;
  defaultConfig: WidgetConfig;
  fields: readonly ConfigField[];
  /** Title on the card, derived from its options (e.g. "Clics por día"). */
  title: (config: WidgetConfig) => string;
};

/** Everything a widget may read to draw itself. */
export type WidgetContext = {
  data: AnalyticsSummary;
  days: AnalyticsRange;
  /** `data` belongs to the previous filter while a new one loads. */
  isStale: boolean;
  scope: OverviewScope;
  /** Touchpoints in the current scope (retired ones excluded). */
  touchpoints: readonly Touchpoint[];
  experiences: readonly ExperienceSummary[];
  groups: readonly TouchpointGroup[];
  canManage: boolean;
  /** False when Analytics Engine did not answer: taps/clicks are unknown. */
  engineAvailable: boolean;
};

export type WidgetRenderProps = {
  widget: WidgetInstance;
  context: WidgetContext;
  /** Rendered small inside the gallery or editor preview. */
  preview?: boolean | undefined;
};

export type WidgetRenderer = ComponentType<WidgetRenderProps>;
