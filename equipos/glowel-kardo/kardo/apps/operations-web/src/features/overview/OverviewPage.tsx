import { useState } from "react";
import { type MetricsRange, metricsApi } from "../../api/metrics.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { StatusCard } from "../../components/StatusCard.js";
import {
  experienceTypeLabels,
  formatNumber,
  touchpointStatusLabels,
  trendDelta,
} from "../../lib/format.js";
import { staffPermissions } from "../../lib/permissions.js";
import { Link } from "../../lib/router.js";
import { useResource } from "../../lib/use-resource.js";
import { useStaff } from "../../shell/StaffContext.js";
import { BarList } from "./charts/BarList.js";
import { ChannelSplitChart } from "./charts/ChannelSplitChart.js";
import { DailyGrowthChart } from "./charts/DailyGrowthChart.js";
import { TapsChannelsChart } from "./charts/TapsChannelsChart.js";
import { KpiCard } from "./KpiCard.js";
import { PublicationHealthPanel } from "./PublicationHealthPanel.js";
import { RankingList } from "./RankingList.js";

const ranges: MetricsRange[] = [7, 30, 90];

export function OverviewPage() {
  const { can } = useStaff();
  const canRead = can(staffPermissions.metricsRead);
  const [days, setDays] = useState<MetricsRange>(7);

  const summary = useResource(canRead ? `metrics:${days}` : null, (signal) =>
    metricsApi.overview(days, signal),
  );
  const data = summary.data;

  if (!canRead) {
    return (
      <div className="page">
        <PageHeader eyebrow="Kardo Operations" title="Resumen" />
        <Notice tone="warning" title="Sin acceso a métricas">
          Tu rol no incluye permiso para ver el resumen operativo.
        </Notice>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        description="Estado del negocio: crecimiento, publicaciones, planes y touchpoints."
        eyebrow="Kardo Operations"
        title="Resumen"
      />

      <div className="toolbar">
        <fieldset className="segmented">
          <legend className="visually-hidden">Rango de días</legend>
          {ranges.map((value) => (
            <button
              aria-pressed={days === value}
              className={days === value ? "segment segment-current" : "segment"}
              key={value}
              onClick={() => setDays(value)}
              type="button"
            >
              {value} días
            </button>
          ))}
        </fieldset>
        {summary.isLoading && data ? (
          <span aria-live="polite" className="muted">
            Actualizando…
          </span>
        ) : null}
      </div>

      {summary.error ? (
        <Notice
          action={
            <button
              className="text-action"
              onClick={() => void summary.reload()}
              type="button"
            >
              Reintentar
            </button>
          }
          tone="error"
        >
          {summary.error}
        </Notice>
      ) : null}

      {summary.isLoading && !data ? (
        <Skeleton lines={6} />
      ) : data ? (
        <>
          <section aria-label="Totales de la plataforma" className="op-totals">
            <StatusCard
              label="Clientes"
              value={formatNumber(data.totals.customers)}
            />
            <StatusCard
              label="Workspaces"
              value={formatNumber(data.totals.workspaces)}
            />
            <StatusCard
              label="Organizaciones"
              value={formatNumber(data.totals.organizations)}
            />
            <StatusCard
              detail={`${formatNumber(data.totals.touchpoints)} en total`}
              label="Touchpoints activos"
              value={formatNumber(data.totals.activeTouchpoints)}
            />
            <StatusCard
              label="Suspendidos"
              value={formatNumber(data.totals.suspendedTouchpoints)}
            />
            <StatusCard
              detail={`${formatNumber(data.totals.experiences)} Experiences totales`}
              label="Experiences en vivo"
              value={formatNumber(data.totals.liveExperiences)}
            />
          </section>

          <section
            aria-label="Indicadores del periodo"
            className="status-grid kd-kpi-grid"
          >
            <KpiCard
              label="Clientes nuevos"
              trendPercent={trendDelta(
                data.period.newCustomers,
                data.period.previousNewCustomers,
              )}
              value={formatNumber(data.period.newCustomers)}
            />
            <KpiCard
              label="Touchpoints nuevos"
              trendPercent={trendDelta(
                data.period.newTouchpoints,
                data.period.previousNewTouchpoints,
              )}
              value={formatNumber(data.period.newTouchpoints)}
            />
            <KpiCard
              label="Publicaciones"
              trendPercent={trendDelta(
                data.period.publications,
                data.period.previousPublications,
              )}
              value={formatNumber(data.period.publications)}
            />
            <KpiCard
              label="Leads"
              trendPercent={trendDelta(
                data.period.leads,
                data.period.previousLeads,
              )}
              value={formatNumber(data.period.leads)}
            />
            <KpiCard
              detail="Suma de NFC, QR y URL directa."
              label="Taps"
              trendPercent={
                data.taps
                  ? trendDelta(data.taps.total, data.taps.previousTotal)
                  : null
              }
              value={data.taps ? formatNumber(data.taps.total) : "—"}
            />
          </section>

          <DailyGrowthChart daily={data.daily} />

          {data.taps ? (
            <>
              <TapsChannelsChart daily={data.taps.daily} />
              <div className="kd-insight-row">
                <ChannelSplitChart channels={data.taps.byChannel} />
                <PublicationHealthPanel
                  failedLast24Hours={data.totals.failedPublicationsLast24Hours}
                  health={data.publicationHealth}
                />
              </div>
            </>
          ) : (
            <>
              <Notice tone="warning" title="Analítica pública no configurada">
                Los taps por NFC, QR y URL directa aún no se pueden consultar en
                este entorno. El resto de las métricas (clientes, touchpoints,
                publicaciones, leads) son datos propios y siguen disponibles.
              </Notice>
              <PublicationHealthPanel
                failedLast24Hours={data.totals.failedPublicationsLast24Hours}
                health={data.publicationHealth}
              />
            </>
          )}

          <div className="kd-ranking-grid">
            <BarList
              emptyLabel="Sin touchpoints registrados."
              id="status-distribution-heading"
              items={data.touchpointStatuses.map((row) => ({
                id: row.status,
                label: touchpointStatusLabels[row.status] ?? row.status,
                value: row.total,
              }))}
              title="Touchpoints por estado"
            />
            <BarList
              emptyLabel="Sin Experiences registradas."
              id="experience-types-heading"
              items={data.experienceTypes.map((row) => ({
                id: row.type,
                label: experienceTypeLabels[row.type] ?? row.type,
                value: row.total,
                secondary: row.live,
                secondaryLabel: "en vivo",
              }))}
              title="Experiences por tipo"
            />
            <BarList
              emptyLabel="Sin planes asignados."
              id="plans-distribution-heading"
              items={data.plans.map((row) => ({
                id: row.planCode,
                label: row.name,
                value: row.workspaces,
              }))}
              title="Distribución de planes"
              valueSuffix="workspaces"
            />
          </div>

          <RankingList
            emptyLabel="Aún no hay actividad por workspace."
            items={data.topWorkspaces.map((workspace) => ({
              id: workspace.workspaceId,
              name: workspace.name,
              value: data.taps ? workspace.taps : workspace.touchpoints,
              link: (
                <Link to={{ name: "customer", id: workspace.workspaceId }}>
                  {workspace.name}
                </Link>
              ),
            }))}
            title="Top workspaces"
            valueSuffix={data.taps ? "taps" : "touchpoints"}
          />
        </>
      ) : null}
    </div>
  );
}
