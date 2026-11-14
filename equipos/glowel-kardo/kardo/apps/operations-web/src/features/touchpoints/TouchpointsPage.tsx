import type { StaffTouchpointRow } from "@kardo/contracts";
import { useCallback, useEffect, useState } from "react";
import {
  type TouchpointQuery,
  type TouchpointStatus,
  touchpointsApi,
} from "../../api/touchpoints.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { errorMessage, isAbortError } from "../../lib/api.js";
import { formatDate, touchpointStatusView } from "../../lib/format.js";
import { appendPage, hasMore } from "../../lib/pagination.js";
import { Link } from "../../lib/router.js";
import { useDebouncedValue } from "../../lib/use-debounced-value.js";

const statuses: { value: TouchpointStatus | "all"; label: string }[] = [
  { value: "all", label: "Todos los estados" },
  { value: "prepared", label: "Preparado" },
  { value: "available", label: "Disponible" },
  { value: "assigned", label: "Asignado" },
  { value: "active", label: "Activo" },
  { value: "paused", label: "Pausado" },
  { value: "lost", label: "Perdido" },
  { value: "replaced", label: "Reemplazado" },
  { value: "retired", label: "Retirado" },
];

const suspendedOptions = [
  { value: "all", label: "Suspendidos o no" },
  { value: "true", label: "Solo suspendidos" },
  { value: "false", label: "Solo activos" },
];

export function TouchpointsPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<TouchpointStatus | "all">("all");
  const [suspended, setSuspended] = useState<"all" | "true" | "false">("all");
  const debouncedQuery = useDebouncedValue(query, 300);

  const [items, setItems] = useState<StaffTouchpointRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildParams = useCallback(
    (cursor?: string): TouchpointQuery => {
      const params: TouchpointQuery = { limit: 20 };
      if (debouncedQuery) params.query = debouncedQuery;
      if (status !== "all") params.status = status;
      if (suspended !== "all") params.suspended = suspended === "true";
      if (cursor) params.cursor = cursor;
      return params;
    },
    [debouncedQuery, status, suspended],
  );

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    touchpointsApi
      .list(buildParams(), controller.signal)
      .then((page) => {
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setIsLoading(false);
      })
      .catch((requestError: unknown) => {
        if (isAbortError(requestError)) return;
        setError(errorMessage(requestError));
        setIsLoading(false);
      });
    return () => controller.abort();
  }, [buildParams]);

  async function loadMore() {
    if (!nextCursor) return;
    setIsLoadingMore(true);
    try {
      const page = await touchpointsApi.list(buildParams(nextCursor));
      setItems((current) => appendPage(current, page));
      setNextCursor(page.nextCursor);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsLoadingMore(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        description="Busca por ID público o nombre operativo."
        eyebrow="Kardo Operations"
        title="Touchpoints"
      />

      <div className="toolbar">
        <label className="search-field">
          <span className="visually-hidden">Buscar touchpoints</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por ID o nombre…"
            type="search"
            value={query}
          />
        </label>
        <label>
          <span className="visually-hidden">Filtrar por estado</span>
          <select
            onChange={(event) =>
              setStatus(event.target.value as TouchpointStatus | "all")
            }
            value={status}
          >
            {statuses.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="visually-hidden">Filtrar por suspensión</span>
          <select
            onChange={(event) =>
              setSuspended(event.target.value as "all" | "true" | "false")
            }
            value={suspended}
          >
            {suspendedOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <Notice tone="error">{error}</Notice>
      ) : isLoading ? (
        <Skeleton lines={6} />
      ) : items.length === 0 ? (
        <EmptyState icon="touchpoint" title="Sin resultados">
          Ningún Touchpoint coincide con esta búsqueda.
        </EmptyState>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Touchpoint</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Experience en vivo</th>
                  <th scope="col">Última publicación</th>
                  <th scope="col">Creado</th>
                </tr>
              </thead>
              <tbody>
                {items.map((touchpoint) => {
                  const view = touchpointStatusView(touchpoint.status);
                  return (
                    <tr key={touchpoint.id}>
                      <td>
                        <Link to={{ name: "touchpoint", id: touchpoint.id }}>
                          <strong>
                            {touchpoint.operationalName ?? touchpoint.publicId}
                          </strong>
                        </Link>
                        <div className="row-meta">{touchpoint.publicId}</div>
                      </td>
                      <td>
                        {touchpoint.workspaceId ? (
                          <Link
                            to={{
                              name: "customer",
                              id: touchpoint.workspaceId,
                            }}
                          >
                            {touchpoint.workspaceName ?? "—"}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <StatusBadge tone={view.tone}>{view.label}</StatusBadge>
                        {touchpoint.suspended ? (
                          <>
                            {" "}
                            <StatusBadge tone="danger">Suspendido</StatusBadge>
                          </>
                        ) : null}
                      </td>
                      <td>{touchpoint.liveExperienceName ?? "—"}</td>
                      <td>{touchpoint.lastPublicationStatus ?? "—"}</td>
                      <td>{formatDate(touchpoint.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {hasMore({ items, nextCursor }) ? (
            <div className="form-actions">
              <button
                className="button button-secondary"
                disabled={isLoadingMore}
                onClick={() => void loadMore()}
                type="button"
              >
                {isLoadingMore ? "Cargando…" : "Cargar más"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
