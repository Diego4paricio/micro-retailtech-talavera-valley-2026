import type { StaffAuditEvent } from "@kardo/contracts";
import { useCallback, useEffect, useState } from "react";
import {
  type AuditActorType,
  type AuditQuery,
  auditApi,
} from "../../api/audit.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Field } from "../../components/Field.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { errorMessage, isAbortError } from "../../lib/api.js";
import { appendPage, hasMore } from "../../lib/pagination.js";
import { useDebouncedValue } from "../../lib/use-debounced-value.js";
import { AuditEventList } from "./AuditEventList.js";

const actorTypes: { value: AuditActorType | "all"; label: string }[] = [
  { value: "all", label: "Cualquier actor" },
  { value: "staff", label: "Staff" },
  { value: "customer", label: "Cliente" },
  { value: "service", label: "Servicio" },
];

export function AuditPage() {
  const [actorType, setActorType] = useState<AuditActorType | "all">("all");
  const [action, setAction] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const debouncedAction = useDebouncedValue(action, 300);
  const debouncedWorkspaceId = useDebouncedValue(workspaceId, 300);

  const [items, setItems] = useState<StaffAuditEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildParams = useCallback(
    (cursor?: string): AuditQuery => {
      const params: AuditQuery = { limit: 20 };
      if (actorType !== "all") params.actorType = actorType;
      if (debouncedAction) params.action = debouncedAction;
      if (debouncedWorkspaceId) params.workspaceId = debouncedWorkspaceId;
      if (cursor) params.cursor = cursor;
      return params;
    },
    [actorType, debouncedAction, debouncedWorkspaceId],
  );

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    auditApi
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
      const page = await auditApi.list(buildParams(nextCursor));
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
        description="Cada acción de staff, cliente o servicio queda registrada aquí."
        eyebrow="Kardo Operations"
        title="Auditoría"
      />

      <div className="toolbar">
        <label>
          <span className="visually-hidden">Tipo de actor</span>
          <select
            onChange={(event) =>
              setActorType(event.target.value as AuditActorType | "all")
            }
            value={actorType}
          >
            {actorTypes.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <Field id="action-filter" label="Prefijo de acción">
          <input
            id="action-filter"
            onChange={(event) => setAction(event.target.value)}
            placeholder="p. ej. touchpoint."
            type="text"
            value={action}
          />
        </Field>
        <Field id="workspace-filter" label="ID de workspace">
          <input
            id="workspace-filter"
            onChange={(event) => setWorkspaceId(event.target.value)}
            placeholder="UUID del workspace"
            type="text"
            value={workspaceId}
          />
        </Field>
      </div>

      {error ? (
        <Notice tone="error">{error}</Notice>
      ) : isLoading ? (
        <Skeleton lines={6} />
      ) : items.length === 0 ? (
        <EmptyState icon="audit" title="Sin eventos">
          Ningún evento coincide con estos filtros.
        </EmptyState>
      ) : (
        <>
          <AuditEventList emptyLabel="Sin eventos." events={items} />
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
