import type { StaffWorkspaceRow } from "@kardo/contracts";
import { useEffect, useState } from "react";
import {
  type WorkspaceKind,
  type WorkspaceQuery,
  workspacesApi,
} from "../../api/workspaces.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { errorMessage, isAbortError } from "../../lib/api.js";
import {
  formatDate,
  formatNumber,
  workspaceKindLabels,
} from "../../lib/format.js";
import { appendPage, hasMore } from "../../lib/pagination.js";
import { Link } from "../../lib/router.js";
import { useDebouncedValue } from "../../lib/use-debounced-value.js";

const kinds: { value: WorkspaceKind | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "personal", label: "Personal" },
  { value: "organization", label: "Organización" },
];

export function CustomersPage() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<WorkspaceKind | "all">("all");
  const debouncedQuery = useDebouncedValue(query, 300);

  const [items, setItems] = useState<StaffWorkspaceRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    const params: WorkspaceQuery = { limit: 20 };
    if (debouncedQuery) params.query = debouncedQuery;
    if (kind !== "all") params.kind = kind;
    workspacesApi
      .list(params, controller.signal)
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
  }, [debouncedQuery, kind]);

  async function loadMore() {
    if (!nextCursor) return;
    setIsLoadingMore(true);
    try {
      const params: WorkspaceQuery = { limit: 20, cursor: nextCursor };
      if (debouncedQuery) params.query = debouncedQuery;
      if (kind !== "all") params.kind = kind;
      const page = await workspacesApi.list(params);
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
        description="Busca por nombre, ID público, correo de un miembro o ID público de un Touchpoint."
        eyebrow="Kardo Operations"
        title="Clientes"
      />

      <div className="toolbar">
        <label className="search-field">
          <span className="visually-hidden">Buscar clientes</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, ID o correo…"
            type="search"
            value={query}
          />
        </label>
        <label>
          <span className="visually-hidden">Filtrar por tipo</span>
          <select
            onChange={(event) =>
              setKind(event.target.value as WorkspaceKind | "all")
            }
            value={kind}
          >
            {kinds.map((item) => (
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
        <EmptyState icon="customers" title="Sin resultados">
          Ningún cliente coincide con esta búsqueda.
        </EmptyState>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Cliente</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Plan</th>
                  <th className="numeric" scope="col">
                    Miembros
                  </th>
                  <th className="numeric" scope="col">
                    Touchpoints
                  </th>
                  <th className="numeric" scope="col">
                    Suspendidos
                  </th>
                  <th className="numeric" scope="col">
                    Leads
                  </th>
                  <th scope="col">Creado</th>
                </tr>
              </thead>
              <tbody>
                {items.map((workspace) => (
                  <tr key={workspace.id}>
                    <td>
                      <Link to={{ name: "customer", id: workspace.id }}>
                        <strong>{workspace.name}</strong>
                      </Link>
                      <div className="row-meta">{workspace.publicId}</div>
                    </td>
                    <td>
                      {workspaceKindLabels[workspace.kind] ?? workspace.kind}
                    </td>
                    <td>{workspace.planCode ?? "—"}</td>
                    <td className="numeric">
                      {formatNumber(workspace.members)}
                    </td>
                    <td className="numeric">
                      {formatNumber(workspace.activeTouchpoints)} /{" "}
                      {formatNumber(workspace.touchpoints)}
                    </td>
                    <td className="numeric">
                      {formatNumber(workspace.suspendedTouchpoints)}
                    </td>
                    <td className="numeric">{formatNumber(workspace.leads)}</td>
                    <td>{formatDate(workspace.createdAt)}</td>
                  </tr>
                ))}
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
