import type { AnalyticsSummary } from "@kardo/contracts";
import { useMemo, useRef, useState } from "react";
import { type AnalyticsRange, analyticsApi } from "../../api/analytics.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader, SectionHeading } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { formatNumber, formatPercent } from "../../lib/format.js";
import { Link } from "../../lib/router.js";
import { useResource } from "../../lib/use-resource.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { HelpButton } from "../help/HelpButton.js";
import { KpiCard } from "../overview/KpiCard.js";
import { useWorkspaceProfile } from "../settings/use-workspace-profile.js";
import { touchpointKindLabels } from "../touchpoints/kind.js";
import {
  PieceThumb,
  pieceKindLabel,
} from "../touchpoints/pieces/PieceThumb.js";
import { AnalyticsEmptyState } from "./AnalyticsEmptyState.js";
import { analyticsEmptyKind } from "./analytics-empty.js";
import { AreaChart } from "./charts/AreaChart.js";
import { percentChange } from "./charts/chart-utils.js";
import { DailyChannelsChart } from "./charts/DailyChannelsChart.js";
import { HourlyChart } from "./charts/HourlyChart.js";
import { TimeZoneNote } from "./TimeZoneNote.js";
import { useTimeZoneSelection } from "./timezone-choice.js";

const ranges: AnalyticsRange[] = [7, 30, 90];
const count = (value: number) => formatNumber(Math.round(value));

function kindLabel(row: AnalyticsSummary["touchpoints"][number]) {
  if (row.kind === "kardo" && row.pieceModel)
    return pieceKindLabel(row.pieceModel);
  return row.kind === "link" ? "Link" : touchpointKindLabels[row.kind];
}

export function AnalyticsPage() {
  const { workspace, touchpoints, experiences, can } = useWorkspace();
  const canRead = can("analytics.read");
  const [days, setDays] = useState<AnalyticsRange>(7);
  const [touchpointId, setTouchpointId] = useState<string>("all");
  const profile = useWorkspaceProfile();
  const timeZone = useTimeZoneSelection(workspace.id, profile.data?.timezone);

  const summary = useResource(
    canRead
      ? `analytics:${workspace.id}:${days}:${touchpointId}:${timeZone.zone}`
      : null,
    (signal) =>
      analyticsApi.summary(
        workspace.id,
        touchpointId === "all"
          ? { days, timeZone: timeZone.zone }
          : { days, touchpointId, timeZone: timeZone.zone },
        signal,
      ),
  );
  // Refetch keeps the frame (previous numbers stay, dimmed, while loading).
  const lastData = useRef<AnalyticsSummary | null>(null);
  if (summary.data) lastData.current = summary.data;
  const data = summary.error ? null : (summary.data ?? lastData.current);
  const isRefreshing = summary.isLoading && Boolean(data);

  const sortedTouchpoints = useMemo(
    () => (data ? [...data.touchpoints].sort((a, b) => b.taps - a.taps) : []),
    [data],
  );
  // «Salón 0 · Terraza 20» (relevo 37, E5): every group, its own tree
  // already summed up by the server (A9-26).
  const byGroup = useMemo(
    () => (data && touchpointId === "all" ? (data.groups ?? []) : []),
    [data, touchpointId],
  );
  const emptyKind = analyticsEmptyKind(
    data,
    touchpoints.data ?? [],
    experiences.data ?? [],
  );

  if (!canRead) {
    return (
      <div className="page">
        <PageHeader eyebrow="Resultados" help="analytics" title="Analítica" />
        <EmptyState
          icon="analytics"
          secondaryAction={<HelpButton section="team" label="Ver roles" />}
          title="Tu rol no incluye analítica"
        >
          Pide a un Owner o Admin del espacio que te dé acceso si lo necesitas.
        </EmptyState>
      </div>
    );
  }

  const isUnavailable = data?.source === "unavailable";
  // Retired Touchpoints are permanently withdrawn: keep them out of the
  // picker (their historical data, if any, still counts in totals).
  const touchpointItems = (touchpoints.data ?? []).filter(
    (touchpoint) => touchpoint.status !== "retired",
  );
  const trendLabel = `vs. ${days} días previos`;
  const maxTaps = Math.max(1, ...sortedTouchpoints.map((item) => item.taps));

  return (
    <div className="page">
      <PageHeader
        description="Accesos por NFC, QR y URL directa, con clics y solicitudes, comparados con el periodo anterior."
        eyebrow="Resultados"
        help="analytics"
        title="Analítica"
      />

      <div className="toolbar analytics-toolbar">
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
        <label>
          <span className="visually-hidden">Filtrar por QR o etiqueta</span>
          <select
            onChange={(event) => setTouchpointId(event.target.value)}
            value={touchpointId}
          >
            <option value="all">Todos los QR y etiquetas</option>
            {touchpointItems.map((touchpoint) => (
              <option key={touchpoint.id} value={touchpoint.id}>
                {touchpoint.operationalName}
              </option>
            ))}
          </select>
        </label>
        <span aria-live="polite" className="kd-refreshing">
          {isRefreshing ? (
            <>
              <span aria-hidden="true" className="button-spinner" />
              Actualizando…
            </>
          ) : null}
        </span>
      </div>

      <TimeZoneNote selection={timeZone} />

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
          title="No pudimos cargar la analítica"
          tone="danger"
        >
          {summary.error}
        </Notice>
      ) : null}

      {summary.isLoading && !data ? (
        <div aria-busy="true">
          <div className="status-grid kd-kpi-grid">
            {["taps", "nfc", "qr", "link", "clicks", "leads"].map((key) => (
              <div className="status-card" key={key}>
                <Skeleton label="Cargando indicadores…" lines={2} />
              </div>
            ))}
          </div>
          <div className="panel kd-chart-skeleton">
            <Skeleton label="Cargando la gráfica…" lines={5} />
          </div>
        </div>
      ) : data ? (
        <div aria-busy={isRefreshing || undefined} className="kd-dashboard">
          {isUnavailable ? (
            <Notice
              title="La analítica en vivo aún no está conectada"
              tone="warning"
              variant="banner"
            >
              Los accesos se registran pero no se pueden consultar todavía.
            </Notice>
          ) : null}

          {emptyKind ? (
            <AnalyticsEmptyState days={days} kind={emptyKind} />
          ) : null}

          <section
            aria-label="Totales del periodo"
            className="status-grid kd-kpi-grid kd-kpi-grid-6"
          >
            <KpiCard
              format={count}
              label="Accesos totales"
              numericValue={data.totals.taps}
              sparkline={data.daily.map((day) => day.taps)}
              trendLabel={trendLabel}
              trendPercent={percentChange(
                data.totals.taps,
                data.previous?.taps,
              )}
              value={formatNumber(data.totals.taps)}
            />
            <KpiCard
              accent="nfc"
              detail={`${formatPercent(data.totals.channels.nfc, data.totals.taps)} de los accesos`}
              format={count}
              help="Personas que acercaron su celular a una etiqueta o tarjeta NFC."
              label="NFC"
              numericValue={data.totals.channels.nfc}
              sparkline={data.daily.map((day) => day.channels.nfc)}
              value={formatNumber(data.totals.channels.nfc)}
            />
            <KpiCard
              accent="qr"
              detail={`${formatPercent(data.totals.channels.qr, data.totals.taps)} de los accesos`}
              format={count}
              help="Personas que escanearon un código QR impreso. Incluye el QR de respaldo de tus etiquetas NFC."
              label="QR"
              numericValue={data.totals.channels.qr}
              sparkline={data.daily.map((day) => day.channels.qr)}
              sparklineTone="aqua"
              value={formatNumber(data.totals.channels.qr)}
            />
            <KpiCard
              accent="link"
              detail={`${formatPercent(data.totals.channels.link, data.totals.taps)} de los accesos`}
              format={count}
              help="Aperturas del enlace compartido, sin NFC ni QR."
              label="URL directa"
              numericValue={data.totals.channels.link}
              sparkline={data.daily.map((day) => day.channels.link)}
              sparklineTone="ink"
              value={formatNumber(data.totals.channels.link)}
            />
            <KpiCard
              format={count}
              help="Toques a botones o enlaces dentro de una página."
              label="Clics en acciones"
              numericValue={data.totals.clicks}
              sparkline={data.daily.map((day) => day.clicks)}
              trendLabel={trendLabel}
              trendPercent={percentChange(
                data.totals.clicks,
                data.previous?.clicks,
              )}
              value={formatNumber(data.totals.clicks)}
            />
            <KpiCard
              format={count}
              help="Formularios de contacto enviados con consentimiento."
              label="Solicitudes"
              numericValue={data.totals.leads}
              trendLabel={trendLabel}
              trendPercent={percentChange(
                data.totals.leads,
                data.previous?.leads,
              )}
              value={formatNumber(data.totals.leads)}
            />
          </section>

          <AreaChart
            description={
              data.previous
                ? `La línea punteada es el promedio diario de los ${days} días anteriores.`
                : undefined
            }
            emptyState={
              <EmptyState
                compact
                icon="analytics"
                secondaryAction={
                  <HelpButton label="Cómo se cuentan" section="analytics" />
                }
                title="Sin accesos en este periodo"
              >
                Prueba un rango más amplio o revisa que tus QR y etiquetas
                tengan una página publicada.
              </EmptyState>
            }
            isUpdating={isRefreshing}
            points={data.daily.map((day) => ({
              date: day.date,
              value: day.taps,
            }))}
            previousAverage={data.previous ? data.previous.taps / days : null}
            title="Tendencia de accesos"
            unit="accesos"
          />

          <div className="kd-analytics-grid">
            <DailyChannelsChart daily={data.daily} isUpdating={isRefreshing} />
            <HourlyChart hourly={data.hourly} isUpdating={isRefreshing} />
          </div>

          {byGroup.length ? (
            <section
              aria-labelledby="groups-analytics-heading"
              className="panel"
            >
              <SectionHeading
                description="Cada grupo suma sus QR y etiquetas, también los de sus subgrupos."
                id="groups-analytics-heading"
                title="Por grupo"
              />
              <div className="table-wrap">
                <table className="data-table kd-touchpoint-table">
                  <thead>
                    <tr>
                      <th scope="col">Grupo</th>
                      <th className="numeric" scope="col">
                        Accesos
                      </th>
                      <th className="numeric" scope="col">
                        Clics
                      </th>
                      <th className="numeric" scope="col">
                        Solicitudes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {byGroup.map((group) => (
                      <tr key={group.groupId}>
                        <td>
                          <span
                            className="kd-group-name"
                            style={{
                              paddingInlineStart: `${group.depth * 16}px`,
                            }}
                          >
                            {group.name}
                          </span>
                          <span aria-hidden="true" className="kd-share-track">
                            <span
                              className="kd-share-fill"
                              style={{
                                width: `${Math.max(2, Math.round((group.taps / Math.max(1, ...byGroup.map((item) => item.taps))) * 100))}%`,
                              }}
                            />
                          </span>
                        </td>
                        <td className="numeric">
                          <strong>{formatNumber(group.taps)}</strong>
                        </td>
                        <td className="numeric">
                          {formatNumber(group.clicks)}
                        </td>
                        <td className="numeric">{formatNumber(group.leads)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section
            aria-labelledby="touchpoints-analytics-heading"
            className="panel"
          >
            <SectionHeading
              description={
                data.touchpointsOmitted
                  ? "Ordenados por accesos. Se muestran los 1000 con más accesos."
                  : "Ordenados por accesos. La barra muestra el peso de cada uno frente al más visitado."
              }
              id="touchpoints-analytics-heading"
              title="Por QR, etiqueta o link"
            />
            {sortedTouchpoints.length ? (
              <div className="table-wrap">
                <table className="data-table kd-touchpoint-table">
                  <thead>
                    <tr>
                      <th scope="col">QR, etiqueta o link</th>
                      <th scope="col">Tipo</th>
                      <th className="numeric" scope="col">
                        Accesos
                      </th>
                      <th className="numeric" scope="col">
                        NFC
                      </th>
                      <th className="numeric" scope="col">
                        QR
                      </th>
                      <th className="numeric" scope="col">
                        URL
                      </th>
                      <th className="numeric" scope="col">
                        Clics
                      </th>
                      <th className="numeric" scope="col">
                        Solicitudes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTouchpoints.map((touchpoint) => (
                      <tr key={touchpoint.touchpointId}>
                        <td>
                          <Link
                            className="kd-table-link"
                            to={
                              touchpoint.kind === "link"
                                ? { name: "link", id: touchpoint.touchpointId }
                                : {
                                    name: "touchpoint",
                                    id: touchpoint.touchpointId,
                                  }
                            }
                          >
                            {touchpoint.pieceModel ? (
                              <PieceThumb
                                model={touchpoint.pieceModel}
                                size={22}
                              />
                            ) : null}
                            {touchpoint.name}
                          </Link>
                          <span aria-hidden="true" className="kd-share-track">
                            <span
                              className="kd-share-fill"
                              style={{
                                width: `${Math.max(2, Math.round((touchpoint.taps / maxTaps) * 100))}%`,
                              }}
                            />
                          </span>
                        </td>
                        <td>{kindLabel(touchpoint)}</td>
                        <td className="numeric">
                          <strong>{formatNumber(touchpoint.taps)}</strong>
                        </td>
                        <td className="numeric">
                          {formatNumber(touchpoint.channels.nfc)}
                        </td>
                        <td className="numeric">
                          {formatNumber(touchpoint.channels.qr)}
                        </td>
                        <td className="numeric">
                          {formatNumber(touchpoint.channels.link)}
                        </td>
                        <td className="numeric">
                          {formatNumber(touchpoint.clicks)}
                        </td>
                        <td className="numeric">
                          {formatNumber(touchpoint.leads)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                compact
                headingLevel={3}
                icon="touchpoint"
                title="Sin datos para este periodo"
              >
                Cuando tus QR y etiquetas reciban accesos, aquí verás cuál rinde
                más.
              </EmptyState>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
