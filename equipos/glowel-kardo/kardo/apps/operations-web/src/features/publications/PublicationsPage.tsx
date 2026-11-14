import type { StaffPublicationRow } from "@kardo/contracts";
import { useCallback, useEffect, useState } from "react";
import {
  type PublicationQueryStatus,
  publicationsApi,
} from "../../api/publications.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage, isAbortError } from "../../lib/api.js";
import {
  formatDateTime,
  formatNumber,
  publicationStatusView,
} from "../../lib/format.js";
import { appendPage, hasMore } from "../../lib/pagination.js";
import { staffPermissions } from "../../lib/permissions.js";
import { Link } from "../../lib/router.js";
import { useStaff } from "../../shell/StaffContext.js";

const tabs: { value: PublicationQueryStatus; label: string }[] = [
  { value: "failed", label: "Fallidas" },
  { value: "pending", label: "Pendientes" },
  { value: "processing", label: "Procesando" },
  { value: "published", label: "Publicadas" },
];

const refreshIntervalMs = 15_000;

export function PublicationsPage() {
  const { can } = useStaff();
  const { notify } = useToast();
  const [status, setStatus] = useState<PublicationQueryStatus>("failed");
  const [items, setItems] = useState<StaffPublicationRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) => {
      setError(null);
      return publicationsApi
        .list({ status, limit: 20 }, signal)
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
    },
    [status],
  );

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // Auto-refresh every 15s while the tab is visible, so failures surface
  // without a manual reload.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, [load]);

  async function loadMore() {
    if (!nextCursor) return;
    setIsLoadingMore(true);
    try {
      const page = await publicationsApi.list({
        status,
        limit: 20,
        cursor: nextCursor,
      });
      setItems((current) => appendPage(current, page));
      setNextCursor(page.nextCursor);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function retry(id: string) {
    setRetryingId(id);
    try {
      const updated = await publicationsApi.retry(id);
      setItems((current) =>
        current.map((item) => (item.id === id ? updated : item)),
      );
      notify("Publicación reintentada.");
    } catch (requestError) {
      notify(errorMessage(requestError), "error");
    } finally {
      setRetryingId(null);
    }
  }

  const canRetry = can(staffPermissions.publicationsRetry);

  return (
    <div className="page">
      <PageHeader
        description="Se actualiza automáticamente cada 15 segundos mientras esta pestaña está visible."
        eyebrow="Kardo Operations"
        title="Publicaciones"
      />

      <fieldset className="segmented">
        <legend className="visually-hidden">Filtrar por estado</legend>
        {tabs.map((tab) => (
          <button
            aria-pressed={status === tab.value}
            className={
              status === tab.value ? "segment segment-current" : "segment"
            }
            key={tab.value}
            onClick={() => setStatus(tab.value)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </fieldset>

      {error ? (
        <Notice tone="error">{error}</Notice>
      ) : isLoading ? (
        <Skeleton lines={6} />
      ) : items.length === 0 ? (
        <EmptyState icon="publications" title="Sin publicaciones">
          No hay publicaciones con este estado.
        </EmptyState>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Cliente</th>
                  <th scope="col">Touchpoint</th>
                  <th scope="col">Experience</th>
                  <th className="numeric" scope="col">
                    Revisión
                  </th>
                  <th className="numeric" scope="col">
                    Intentos
                  </th>
                  <th scope="col">Error</th>
                  <th scope="col">Fecha</th>
                  {canRetry ? <th scope="col">Acción</th> : null}
                </tr>
              </thead>
              <tbody>
                {items.map((publication) => {
                  const view = publicationStatusView(publication.status);
                  return (
                    <tr key={publication.id}>
                      <td>
                        {publication.workspaceId ? (
                          <Link
                            to={{
                              name: "customer",
                              id: publication.workspaceId,
                            }}
                          >
                            {publication.workspaceName ?? "—"}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <Link
                          to={{
                            name: "touchpoint",
                            id: publication.touchpointId,
                          }}
                        >
                          {publication.touchpointName ??
                            publication.touchpointPublicId}
                        </Link>
                      </td>
                      <td>
                        {publication.experienceName}
                        <div className="row-meta">
                          <StatusBadge tone={view.tone}>
                            {view.label}
                          </StatusBadge>
                        </div>
                      </td>
                      <td className="numeric">{publication.versionRevision}</td>
                      <td className="numeric">
                        {formatNumber(publication.attempts)}
                      </td>
                      <td className="op-message-cell">
                        {publication.lastError ?? "—"}
                      </td>
                      <td>
                        {formatDateTime(
                          publication.publishedAt ?? publication.createdAt,
                        )}
                      </td>
                      {canRetry ? (
                        <td>
                          {publication.status === "failed" ? (
                            <button
                              className="button button-secondary button-small"
                              disabled={retryingId === publication.id}
                              onClick={() => void retry(publication.id)}
                              type="button"
                            >
                              {retryingId === publication.id
                                ? "Reintentando…"
                                : "Reintentar"}
                            </button>
                          ) : null}
                        </td>
                      ) : null}
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
