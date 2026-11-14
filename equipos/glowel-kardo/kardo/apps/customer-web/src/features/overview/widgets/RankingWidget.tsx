import type { PieceModel } from "@kardo/contracts";
import { formatNumber } from "../../../lib/format.js";
import { Link } from "../../../lib/router.js";
import {
  PieceThumb,
  pieceModelOf,
} from "../../touchpoints/pieces/PieceThumb.js";
import type { WidgetRenderProps } from "../dashboard/types.js";
import {
  type RankMetric,
  rankMetricValue,
  rankRows,
} from "./charts/aggregate.js";
import { BarRanking, type BarRankingRow } from "./charts/BarRanking.js";

const dimensions = ["touchpoints", "experiences", "groups"] as const;
type Dimension = (typeof dimensions)[number];
const metrics: RankMetric[] = ["taps", "clicks", "leads", "conversion"];

const conversionFormat = new Intl.NumberFormat("es-MX", {
  style: "percent",
  maximumFractionDigits: 1,
});

function resolveDimension(value: unknown): Dimension {
  return dimensions.includes(value as Dimension)
    ? (value as Dimension)
    : "touchpoints";
}
function resolveMetric(value: unknown): RankMetric {
  return metrics.includes(value as RankMetric) ? (value as RankMetric) : "taps";
}
function resolveLimit(value: unknown): number {
  return value === "10" || value === 10 ? 10 : 5;
}

function valueLabel(metric: RankMetric, value: number): string {
  return metric === "conversion"
    ? conversionFormat.format(value)
    : formatNumber(value);
}

/** The Touchpoints, Experiences or groups that rank highest on a metric —
 * Kardo's original ranking, as horizontal bars instead of a table. */
export function RankingWidget({ widget, context }: WidgetRenderProps) {
  const dimension = resolveDimension(widget.config.dimension);
  const metric = resolveMetric(widget.config.metric);
  const limit = resolveLimit(widget.config.limit);
  const { data, touchpoints } = context;

  if (!context.engineAvailable && metric !== "leads")
    return (
      <p className="kw-empty">Disponible cuando vuelva la analítica en vivo.</p>
    );

  const kindById = new Map(touchpoints.map((item) => [item.id, item.kind]));
  // A Kardo piece shows its picture next to its name (ADR 026).
  const pieceById = new Map(
    touchpoints.map((item) => [item.id, pieceModelOf(item)]),
  );

  let rows: BarRankingRow[] = [];
  let emptyMessage = "";
  let ariaLabel = "";

  if (dimension === "touchpoints") {
    emptyMessage = "Aún no hay accesos en tus QR y etiquetas en este periodo.";
    ariaLabel = "QR y etiquetas por accesos";
    const ranked = rankRows(data.touchpoints, metric, limit);
    const total = ranked.reduce(
      (sum, row) => sum + rankMetricValue(row, metric),
      0,
    );
    rows = ranked.map((row) => ({
      id: row.touchpointId,
      name: (
        <Link
          to={
            kindById.get(row.touchpointId) === "link"
              ? { name: "link", id: row.touchpointId }
              : { name: "touchpoint", id: row.touchpointId }
          }
        >
          {(row.pieceModel ?? pieceById.get(row.touchpointId)) ? (
            <PieceThumb
              model={
                (row.pieceModel ??
                  pieceById.get(row.touchpointId)) as PieceModel
              }
              size={20}
            />
          ) : null}
          {row.name}
        </Link>
      ),
      value: rankMetricValue(row, metric),
      valueLabel: valueLabel(metric, rankMetricValue(row, metric)),
      shareLabel:
        metric === "conversion" || total === 0
          ? undefined
          : `${Math.round((rankMetricValue(row, metric) / total) * 100)} %`,
    }));
  } else if (dimension === "experiences") {
    emptyMessage = "Aún no hay accesos a tus páginas en este periodo.";
    ariaLabel = "Páginas por accesos";
    const ranked = rankRows(data.experiences ?? [], metric, limit);
    const total = ranked.reduce(
      (sum, row) => sum + rankMetricValue(row, metric),
      0,
    );
    rows = ranked.map((row) => ({
      id: row.experienceId,
      name: (
        <Link to={{ name: "experience", id: row.experienceId }}>
          {row.name}
        </Link>
      ),
      value: rankMetricValue(row, metric),
      valueLabel: valueLabel(metric, rankMetricValue(row, metric)),
      shareLabel:
        metric === "conversion" || total === 0
          ? undefined
          : `${Math.round((rankMetricValue(row, metric) / total) * 100)} %`,
    }));
  } else {
    emptyMessage = "Ningún grupo recibió accesos en este periodo.";
    ariaLabel = "Grupos por accesos";
    const ranked = rankRows(data.groups ?? [], metric, limit);
    const total = ranked.reduce(
      (sum, row) => sum + rankMetricValue(row, metric),
      0,
    );
    rows = ranked.map((row) => ({
      id: row.groupId,
      name: row.name,
      value: rankMetricValue(row, metric),
      valueLabel: valueLabel(metric, rankMetricValue(row, metric)),
      shareLabel:
        metric === "conversion" || total === 0
          ? undefined
          : `${Math.round((rankMetricValue(row, metric) / total) * 100)} %`,
    }));
  }

  return (
    <BarRanking ariaLabel={ariaLabel} emptyMessage={emptyMessage} rows={rows} />
  );
}
