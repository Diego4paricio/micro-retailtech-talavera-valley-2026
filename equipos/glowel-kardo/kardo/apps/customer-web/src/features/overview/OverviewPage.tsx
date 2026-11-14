import type { Touchpoint } from "@kardo/contracts";
import { useEffect, useMemo, useState } from "react";
import type { AnalyticsRange } from "../../api/analytics.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { formatTime } from "../../lib/format.js";
import { useRouter } from "../../lib/router.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { AnalyticsEmptyState } from "../analytics/AnalyticsEmptyState.js";
import { analyticsEmptyKind } from "../analytics/analytics-empty.js";
import { TimeZoneNote } from "../analytics/TimeZoneNote.js";
import { useTimeZoneSelection } from "../analytics/timezone-choice.js";
import { useWorkspaceProfile } from "../settings/use-workspace-profile.js";
import { flattenGroupTree, indentedName } from "../touchpoints/group-tree.js";
import { Dashboard } from "./dashboard/Dashboard.js";
import { periodLabels } from "./dashboard/header-model.js";
import { useDashboardLayout } from "./dashboard/layout-store.js";
import { OverviewHeader } from "./dashboard/OverviewHeader.js";
import type { WidgetContext } from "./dashboard/types.js";
import {
  decodeScope,
  encodeScope,
  ranges,
  readFilters,
  touchpointsInScope,
  validScope,
  writeFilters,
} from "./filters.js";
import { SignalPulse } from "./SignalPulse.js";
import {
  type OverviewScope,
  prefetchSummary,
  type SummaryQuery,
  useOverviewSummary,
} from "./summary-store.js";

const isRange = (days: number): days is AnalyticsRange =>
  (ranges as readonly number[]).includes(days);

export function OverviewPage() {
  const { workspace, session, touchpoints, experiences, groups, can } =
    useWorkspace();
  const { navigate } = useRouter();
  const canAnalytics = can("analytics.read");
  const canManage = can("touchpoints.manage");

  const [query, setQuery] = useState<SummaryQuery>(() =>
    readFilters(workspace.id),
  );
  const [editing, setEditing] = useState(false);
  const board = useDashboardLayout(workspace.id, canAnalytics);
  const profile = useWorkspaceProfile();
  const timeZone = useTimeZoneSelection(workspace.id, profile.data?.timezone);

  // A saved group or Touchpoint that no longer exists falls back to "all".
  const scope = validScope(query.scope, groups.data, touchpoints.data);
  const summary = useOverviewSummary(
    workspace.id,
    { days: query.days, scope, timeZone: timeZone.zone },
    canAnalytics,
  );
  const data = summary.data;
  const emptyKind = analyticsEmptyKind(
    data,
    touchpoints.data ?? [],
    experiences.data ?? [],
  );

  function updateQuery(next: SummaryQuery) {
    setQuery(next);
    writeFilters(workspace.id, next);
  }

  const inScope = useMemo(
    () => touchpointsInScope(scope, touchpoints.data ?? [], groups.data ?? []),
    [scope, touchpoints.data, groups.data],
  );

  const context = useMemo<WidgetContext | null>(
    () =>
      data
        ? {
            data,
            days: isRange(data.days) ? data.days : query.days,
            isStale: summary.isStale,
            scope,
            touchpoints: inScope,
            experiences: experiences.data ?? [],
            groups: groups.data ?? [],
            canManage,
            engineAvailable: data.source !== "unavailable",
          }
        : null,
    [
      data,
      query.days,
      summary.isStale,
      scope,
      inScope,
      experiences.data,
      groups.data,
      canManage,
    ],
  );

  // The dates on screen; while a new filter loads, the period by its length.
  const fresh = data && !summary.isStale ? data : null;
  const period = useMemo(
    () =>
      periodLabels(
        query.days,
        fresh?.daily[0]?.date,
        fresh?.daily[fresh.daily.length - 1]?.date,
      ),
    [query.days, fresh],
  );

  // Nothing to arrange without numbers on screen.
  useEffect(() => {
    if (!context) setEditing(false);
  }, [context]);

  const touchpointItems = touchpoints.data ?? [];

  return (
    <div className="page ov">
      <OverviewHeader
        actions={
          <>
            {canAnalytics ? (
              <button
                aria-pressed={editing}
                className="button button-secondary"
                disabled={!context}
                onClick={() => setEditing((value) => !value)}
                type="button"
              >
                {editing ? (
                  <>
                    <Icon name="check" size={16} /> Listo
                  </>
                ) : (
                  <>
                    <Icon name="board" size={16} /> Editar tablero
                  </>
                )}
              </button>
            ) : null}
            {canManage ? (
              <button
                className="button button-primary"
                onClick={() => navigate({ name: "touchpoints" })}
                type="button"
              >
                <Icon name="plus" size={16} /> Nuevo QR o etiqueta
              </button>
            ) : null}
          </>
        }
        period={period}
        userId={session.user.id}
        workspace={workspace}
      />

      {canAnalytics ? (
        <>
          <FilterBar
            groupItems={groups.data ?? []}
            isBusy={summary.isLoading || summary.isRefreshing}
            onChange={updateQuery}
            onRefresh={summary.reload}
            query={{ days: query.days, scope }}
            touchpointItems={touchpointItems}
            updatedAt={
              data
                ? formatTime(data.generatedAt, { timeZone: timeZone.zone })
                : null
            }
            workspaceId={workspace.id}
          />
          <TimeZoneNote selection={timeZone} />
        </>
      ) : null}

      {summary.error ? (
        <Notice
          action={
            <button
              className="text-action"
              onClick={() => summary.reload()}
              type="button"
            >
              Reintentar
            </button>
          }
          title="No pudimos cargar los números"
          tone="danger"
        >
          {summary.error}
        </Notice>
      ) : null}

      {data?.source === "unavailable" ? (
        <Notice
          title="Los accesos y clics no respondieron a tiempo"
          tone="warning"
          variant="banner"
        >
          Se muestran solicitudes y QR y etiquetas, que sí están al día. Vuelve
          a intentarlo en unos minutos.
        </Notice>
      ) : null}

      {!canAnalytics ? (
        <p className="ov-empty-line">
          Tu rol no incluye analítica. Pide acceso a un Owner o Admin del
          espacio.
        </p>
      ) : (
        <>
          {context && emptyKind ? (
            <AnalyticsEmptyState days={query.days} kind={emptyKind} />
          ) : null}
          {context || summary.isLoading ? (
            <Dashboard
              context={context}
              days={query.days}
              editing={editing}
              isStale={summary.isStale}
              onEditingChange={setEditing}
              store={board}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function FilterBar({
  workspaceId,
  query,
  onChange,
  onRefresh,
  groupItems,
  touchpointItems,
  updatedAt,
  isBusy,
}: {
  workspaceId: string;
  query: SummaryQuery;
  onChange: (query: SummaryQuery) => void;
  onRefresh: () => void;
  groupItems: { id: string; name: string; parentId?: string | null }[];
  touchpointItems: Touchpoint[];
  /** Already formatted in the chosen zone (A9-25); null while unknown. */
  updatedAt: string | null;
  isBusy: boolean;
}) {
  // A 1 px sentinel just above the bar: once it scrolls out of view, the bar
  // is stuck to the top and draws its separating rule.
  const [sentinel, setSentinel] = useState<HTMLSpanElement | null>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) =>
      setStuck(entry ? !entry.isIntersecting : false),
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel]);
  const physical = touchpointItems.filter(
    (item) => item.status !== "retired" && item.kind !== "link",
  );
  const links = touchpointItems.filter(
    (item) => item.status !== "retired" && item.kind === "link",
  );
  const setScope = (scope: OverviewScope) => onChange({ ...query, scope });

  return (
    <>
      <span aria-hidden="true" className="ov-sentinel" ref={setSentinel} />
      <div
        className={isBusy ? "ov-filters ov-filters-busy" : "ov-filters"}
        data-stuck={stuck || undefined}
      >
        <fieldset className="ov-periods">
          <legend className="visually-hidden">Periodo</legend>
          {ranges.map((days) => (
            <button
              aria-pressed={query.days === days}
              className={
                query.days === days ? "ov-period ov-period-on" : "ov-period"
              }
              key={days}
              onClick={() => onChange({ ...query, days })}
              onFocus={() => prefetchSummary(workspaceId, { ...query, days })}
              onPointerEnter={() =>
                prefetchSummary(workspaceId, { ...query, days })
              }
              type="button"
            >
              {days} días
            </button>
          ))}
        </fieldset>

        <label className="ov-scope">
          <span className="ov-scope-label">Mostrar</span>
          <select
            onChange={(event) => setScope(decodeScope(event.target.value))}
            value={encodeScope(query.scope)}
          >
            <option value="all">Todo el espacio</option>
            {groupItems.length ? (
              <optgroup label="Grupos">
                {flattenGroupTree(groupItems).map(({ group, depth }) => (
                  <option key={group.id} value={`group:${group.id}`}>
                    {indentedName(group.name, depth)}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {physical.length ? (
              <optgroup label="QR y etiquetas">
                {physical.map((item) => (
                  <option key={item.id} value={`touchpoint:${item.id}`}>
                    {item.operationalName}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {links.length ? (
              <optgroup label="Links">
                {links.map((item) => (
                  <option key={item.id} value={`touchpoint:${item.id}`}>
                    {item.operationalName}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
          <Icon className="ov-scope-caret" name="chevron-down" size={16} />
        </label>

        <div className="ov-status">
          <SignalPulse active={isBusy} />
          <span aria-live="polite" className="ov-status-text">
            {isBusy
              ? "Actualizando"
              : updatedAt
                ? `Actualizado ${updatedAt}`
                : ""}
          </span>
          <button
            aria-label="Actualizar ahora"
            className="ov-icon-button"
            disabled={isBusy}
            onClick={onRefresh}
            type="button"
          >
            <Icon name="refresh" size={16} />
          </button>
        </div>
        <span aria-hidden="true" className="ov-progress" />
      </div>
    </>
  );
}
