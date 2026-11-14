import type { Notification } from "@kardo/contracts";
import { useCallback, useEffect, useState } from "react";
import { notificationsApi } from "../../api/notifications.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader } from "../../components/PageHeader.js";
import { errorMessage, isAbortError } from "../../lib/api.js";
import { useRouter } from "../../lib/router.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { markReadLocally } from "./model.js";
import { NotificationItem } from "./NotificationItem.js";
import { useNotifications } from "./NotificationsProvider.js";

const PAGE_SIZE = 20;

type Filter = "unread" | "all";

/** «Ver todas» from the bell (ADR 022): every notification, 20 at a time. */
export function NotificationsPage() {
  const inbox = useNotifications();
  const { navigate } = useRouter();
  const { workspace, selectWorkspace } = useWorkspace();
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<Notification[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) => {
      setError(null);
      return notificationsApi
        .inbox({ limit: PAGE_SIZE, unread: filter === "unread" }, signal)
        .then((page) => {
          setItems(page.items);
          setNextCursor(page.nextCursor);
          setIsLoading(false);
        })
        .catch((caught: unknown) => {
          if (isAbortError(caught)) return;
          setError(errorMessage(caught));
          setIsLoading(false);
        });
    },
    [filter],
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
      const page = await notificationsApi.inbox({
        limit: PAGE_SIZE,
        cursor: nextCursor,
        unread: filter === "unread",
      });
      setItems((current) => [
        ...current,
        ...page.items.filter((item) => !current.some((c) => c.id === item.id)),
      ]);
      setNextCursor(page.nextCursor);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsLoadingMore(false);
    }
  }

  function read(notification: Notification) {
    if (notification.readAt !== null) return;
    setItems((current) =>
      markReadLocally(
        current,
        new Set([notification.id]),
        new Date().toISOString(),
      ),
    );
    inbox?.markRead(notification.id, true);
  }

  function readAll() {
    setItems((current) =>
      markReadLocally(current, "all", new Date().toISOString()),
    );
    inbox?.markAllRead();
  }

  const unreadCount = inbox?.unreadCount ?? 0;

  return (
    <div className="notif-page">
      <PageHeader
        actions={
          unreadCount > 0 ? (
            <button
              className="button button-secondary"
              onClick={readAll}
              type="button"
            >
              Marcar todas como leídas
            </button>
          ) : null
        }
        description="Los avisos de Kardo para ti: novedades de la plataforma, mantenimientos y mensajes sobre tu cuenta."
        title="Notificaciones"
      />
      <div className="notif-page-toolbar">
        <fieldset className="segmented">
          <legend className="visually-hidden">Mostrar</legend>
          {(
            [
              ["all", "Todas"],
              [
                "unread",
                unreadCount > 0 ? `No leídas (${unreadCount})` : "No leídas",
              ],
            ] as const
          ).map(([value, label]) => (
            <button
              aria-pressed={filter === value}
              className={
                filter === value ? "segment segment-current" : "segment"
              }
              key={value}
              onClick={() => setFilter(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </fieldset>
      </div>

      {error ? (
        <Notice
          action={
            <button
              className="text-action"
              onClick={() => void load()}
              type="button"
            >
              Reintentar
            </button>
          }
          tone="danger"
        >
          {error}
        </Notice>
      ) : null}

      {isLoading ? (
        <p className="notif-page-empty">Cargando…</p>
      ) : items.length === 0 && !error ? (
        <div className="notif-page-empty">
          <p className="notif-empty-title">
            {filter === "unread"
              ? "Leíste todas tus notificaciones"
              : "Todavía no tienes notificaciones"}
          </p>
          <p>
            Cuando Kardo publique una novedad, programe un mantenimiento o te
            escriba sobre tu cuenta, aparecerá aquí y en la campana.
          </p>
        </div>
      ) : (
        <div className="notif-page-list">
          {items.map((notification) => (
            <NotificationItem
              currentWorkspaceId={workspace.id}
              key={notification.id}
              navigate={navigate}
              onSelectWorkspace={selectWorkspace}
              notification={notification}
              onRead={read}
              variant="page"
            />
          ))}
        </div>
      )}

      {nextCursor ? (
        <div className="notif-page-more">
          <button
            className="button button-secondary"
            disabled={isLoadingMore}
            onClick={() => void loadMore()}
            type="button"
          >
            {isLoadingMore ? "Cargando…" : "Ver anteriores"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
