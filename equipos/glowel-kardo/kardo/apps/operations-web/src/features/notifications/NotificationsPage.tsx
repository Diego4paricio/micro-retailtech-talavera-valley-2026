import type {
  StaffNotification,
  StaffNotificationState,
} from "@kardo/contracts";
import { useCallback, useEffect, useState } from "react";
import { notificationsApi } from "../../api/notifications.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { errorMessage, isAbortError } from "../../lib/api.js";
import { appendPage, hasMore } from "../../lib/pagination.js";
import { staffPermissions } from "../../lib/permissions.js";
import { Link } from "../../lib/router.js";
import { useStaff } from "../../shell/StaffContext.js";
import { NotificationRow } from "./NotificationRow.js";

const tabs: { value: StaffNotificationState; label: string }[] = [
  { value: "active", label: "Activas" },
  { value: "scheduled", label: "Programadas" },
  { value: "expired", label: "Caducadas" },
  { value: "retired", label: "Retiradas" },
];

const emptyCopy: Record<StaffNotificationState, string> = {
  active: "No hay notificaciones activas en este momento.",
  scheduled: "No hay notificaciones programadas.",
  expired: "Ninguna notificación ha caducado todavía.",
  retired: "No se ha retirado ninguna notificación.",
};

export function NotificationsPage() {
  const { can } = useStaff();
  const [state, setState] = useState<StaffNotificationState>("active");
  const [items, setItems] = useState<StaffNotification[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate =
    can(staffPermissions.notificationsSend) ||
    can(staffPermissions.notificationsBroadcast);

  const load = useCallback(
    (signal: AbortSignal) => {
      setError(null);
      return notificationsApi
        .list({ state, limit: 20 }, signal)
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
    [state],
  );

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function loadMore() {
    if (!nextCursor) return;
    setIsLoadingMore(true);
    try {
      const page = await notificationsApi.list({
        state,
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

  return (
    <div className="page">
      <PageHeader
        actions={
          canCreate ? (
            <Link
              className="button button-primary"
              to={{ name: "notification-new" }}
            >
              Nueva notificación
            </Link>
          ) : undefined
        }
        description="Avisos que los clientes leen en la campana de su panel. No se mandan por correo."
        eyebrow="Kardo Operations"
        title="Notificaciones"
      />

      <fieldset className="segmented">
        <legend className="visually-hidden">Filtrar por estado</legend>
        {tabs.map((tab) => (
          <button
            aria-pressed={state === tab.value}
            className={
              state === tab.value ? "segment segment-current" : "segment"
            }
            key={tab.value}
            onClick={() => setState(tab.value)}
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
        <EmptyState icon="bell" title="Sin notificaciones">
          {emptyCopy[state]}
        </EmptyState>
      ) : (
        <>
          <ul className="ntf-list">
            {items.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
              />
            ))}
          </ul>
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
