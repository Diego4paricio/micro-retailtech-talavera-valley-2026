import {
  type KpiMetric,
  kpiDefinitions,
  kpiMetrics,
} from "../dashboard/catalog.js";
import type { WidgetRenderProps } from "../dashboard/types.js";
import { KpiCard } from "../KpiCard.js";
import { accessDependentKpis, buildKpiView } from "./charts/kpi-view.js";

function resolveMetric(value: unknown): KpiMetric {
  return kpiMetrics.some((item) => item.value === value)
    ? (value as KpiMetric)
    : "taps";
}

/**
 * `frame: "bare"` — this component *is* the whole card: Kardo's original KPI
 * (status-card, label + (i) tooltip, big display figure that counts up once,
 * sparkline with a gradient fill and end dot, and a ▲/▼ delta chip).
 */
export function KpiWidget({ widget, context }: WidgetRenderProps) {
  const metric = resolveMetric(widget.config.metric);
  const label =
    kpiMetrics.find((item) => item.value === metric)?.label ?? "Indicador";
  // `widget.w` is always in 12-column board units, whatever the current
  // breakpoint draws it at: at 2 columns or narrower there is only room for
  // the figure itself, so the trace goes rather than risk clipping it.
  const sparklineOn = widget.config.sparkline !== false && widget.w > 2;
  const trendLabel = `vs. ${context.days} días previos`;

  if (!context.engineAvailable && accessDependentKpis.has(metric)) {
    return (
      <article className="status-card kd-kpi-card">
        <p className="kd-kpi-label">{label}</p>
        <p className="kw-empty">
          Disponible cuando vuelva la analítica en vivo.
        </p>
      </article>
    );
  }

  const view = buildKpiView(metric, context.data, sparklineOn);
  if (!view) {
    return (
      <article className="status-card kd-kpi-card">
        <p className="kd-kpi-label">{label}</p>
        <p className="kw-empty">Sin datos para este periodo.</p>
      </article>
    );
  }

  return (
    <KpiCard
      detail={view.detail}
      format={view.format}
      help={kpiDefinitions[metric]}
      label={label}
      numericValue={view.numericValue}
      sparkline={view.sparkline}
      trendLabel={trendLabel}
      trendPercent={view.trendPercent}
      value={view.value}
    />
  );
}
