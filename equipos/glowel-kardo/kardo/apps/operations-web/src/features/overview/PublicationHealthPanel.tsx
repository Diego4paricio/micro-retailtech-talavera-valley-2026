import type { StaffMetricsOverview } from "@kardo/contracts";
import { SectionHeading } from "../../components/PageHeader.js";
import { formatDuration, formatNumber, formatRatio } from "../../lib/format.js";

export function PublicationHealthPanel({
  health,
  failedLast24Hours,
}: {
  health: StaffMetricsOverview["publicationHealth"];
  failedLast24Hours: number;
}) {
  const successPercent =
    health.successRate === null ? 0 : Math.round(health.successRate * 100);
  return (
    <section aria-labelledby="publication-health-heading" className="panel">
      <SectionHeading
        id="publication-health-heading"
        title="Salud de publicaciones"
      />
      <div className="op-health-grid">
        <div className="op-health-metric">
          <p>Tasa de éxito</p>
          <strong>{formatRatio(health.successRate)}</strong>
        </div>
        <div className="op-health-metric">
          <p>Tiempo medio</p>
          <strong>{formatDuration(health.medianSeconds)}</strong>
        </div>
        <div className="op-health-metric">
          <p>Fallidas · 24 h</p>
          <strong>{formatNumber(failedLast24Hours)}</strong>
        </div>
        <div className="op-health-metric">
          <p>Pendientes</p>
          <strong>{formatNumber(health.pending)}</strong>
        </div>
      </div>
      <div
        aria-label={`Tasa de éxito de publicaciones: ${formatRatio(health.successRate)}`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={successPercent}
        className="op-gauge-track"
        role="progressbar"
      >
        <div
          className="op-gauge-fill"
          style={{ width: `${successPercent}%` }}
        />
      </div>
      <p className="chart-tooltip-hint muted">
        {formatNumber(health.succeeded)} publicadas y{" "}
        {formatNumber(health.failed)} fallidas en el periodo.
      </p>
    </section>
  );
}
