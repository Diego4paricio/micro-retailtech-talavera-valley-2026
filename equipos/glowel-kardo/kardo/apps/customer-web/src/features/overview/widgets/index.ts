import type { WidgetRenderer, WidgetType } from "../dashboard/types.js";
import { ChannelInteractionWidget } from "./ChannelInteractionWidget.js";
import { ChannelsWidget } from "./ChannelsWidget.js";
import { ChannelTrendWidget } from "./ChannelTrendWidget.js";
import { ExperienceTypesWidget } from "./ExperienceTypesWidget.js";
import { FunnelWidget } from "./FunnelWidget.js";
import { HeatmapWidget } from "./HeatmapWidget.js";
import { HourOfDayWidget } from "./HourOfDayWidget.js";
import { Hours24Widget } from "./Hours24Widget.js";
import { KpiWidget } from "./KpiWidget.js";
import { RankingWidget } from "./RankingWidget.js";
import { SilentWidget } from "./SilentWidget.js";
import { TrendWidget } from "./TrendWidget.js";
import { WeekdayWidget } from "./WeekdayWidget.js";

/**
 * Widget renderers by type. Each draws only its body (see `dashboard/types.ts`
 * — `WidgetRenderProps`): the card frame, title and menu belong to the grid.
 * `kpi`'s `frame` is `"bare"`, so `KpiWidget` is the whole card instead.
 */
export const widgetRenderers: Record<WidgetType, WidgetRenderer> = {
  kpi: KpiWidget,
  trend: TrendWidget,
  channels: ChannelsWidget,
  channelTrend: ChannelTrendWidget,
  channelInteraction: ChannelInteractionWidget,
  heatmap: HeatmapWidget,
  hours24: Hours24Widget,
  hourOfDay: HourOfDayWidget,
  weekday: WeekdayWidget,
  ranking: RankingWidget,
  funnel: FunnelWidget,
  experienceTypes: ExperienceTypesWidget,
  silent: SilentWidget,
};
