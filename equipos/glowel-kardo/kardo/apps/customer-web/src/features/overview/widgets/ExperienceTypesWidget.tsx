import type { ExperienceType } from "@kardo/contracts";
import { formatNumber } from "../../../lib/format.js";
import { experienceTypeLabels } from "../../experiences/labels.js";
import type { WidgetRenderProps } from "../dashboard/types.js";
import { BarRanking, type BarRankingRow } from "./charts/BarRanking.js";

const metrics = ["taps", "clicks", "leads"] as const;
type Metric = (typeof metrics)[number];

function resolveMetric(value: unknown): Metric {
  return metrics.includes(value as Metric) ? (value as Metric) : "taps";
}

/** Which Experience formats (menu, perfil, formulario…) get opened, clicked
 * or converted the most, grouped by type. */
export function ExperienceTypesWidget({ widget, context }: WidgetRenderProps) {
  const metric = resolveMetric(widget.config.metric);
  const experiences = context.data.experiences ?? [];

  if (!context.engineAvailable && metric !== "leads")
    return (
      <p className="kw-empty">Disponible cuando vuelva la analítica en vivo.</p>
    );

  const totals = new Map<ExperienceType, number>();
  for (const experience of experiences) {
    const current = totals.get(experience.type) ?? 0;
    totals.set(experience.type, current + experience[metric]);
  }
  const entries = [...totals.entries()]
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1]);
  const grandTotal = entries.reduce((sum, [, value]) => sum + value, 0);

  const rows: BarRankingRow[] = entries.map(([type, value]) => ({
    id: type,
    name: experienceTypeLabels[type],
    value,
    valueLabel: formatNumber(value),
    shareLabel:
      grandTotal > 0
        ? `${Math.round((value / grandTotal) * 100)} %`
        : undefined,
  }));

  return (
    <BarRanking
      ariaLabel="Páginas por tipo"
      emptyMessage="Aún no hay accesos a tus páginas en este periodo."
      rows={rows}
    />
  );
}
