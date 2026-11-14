import type { Notification } from "@kardo/contracts";
import { Popover } from "radix-ui";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon.js";
import { type Route, routePath, useRouter } from "../../lib/router.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { badgeText } from "./model.js";
import { NotificationItem } from "./NotificationItem.js";
import { useNotifications } from "./NotificationsProvider.js";

/**
 * The bell left of «Ayuda» (ADR 022). With unread notifications published
 * since the person last opened it, it opens on its own once on entry; after
 * that only the number stays. Opening it does not mark anything read.
 * Opened on its own, it closes by itself after a few seconds unless the
 * person points at it or moves into it: it covered «Elegir archivo» in
 * Archivos and other buttons (relevo 37, S10).
 */
const AUTO_CLOSE_MS = 7000;
export function NotificationBell() {
  const inbox = useNotifications();
  const { navigate, route } = useRouter();
  const { workspace, selectWorkspace } = useWorkspace();
  const onPage = route.name === "notifications";
  const [open, setOpen] = useState(false);
  const autoOpened = useRef(false);
  // Opened on its own: it must not take the focus from the page.
  const openedByItself = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const autoOpen = inbox?.autoOpen ?? false;
  const markOpened = inbox?.markOpened;
  const unreadCount = inbox?.unreadCount ?? 0;

  useEffect(() => {
    if (!autoOpen || autoOpened.current) return;
    autoOpened.current = true;
    // On «Notificaciones» itself they are already in view: no popover.
    if (onPage) return;
    openedByItself.current = true;
    setOpen(true);
  }, [autoOpen, onPage]);

  // Opened on its own: it goes away by itself unless the person engages.
  const [engaged, setEngaged] = useState(false);
  useEffect(() => {
    if (!open || !openedByItself.current || engaged) return;
    const timer = window.setTimeout(() => setOpen(false), AUTO_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [open, engaged]);

  // Seen in the bell or on the page: it stops opening on its own.
  useEffect(() => {
    if ((open || onPage) && (autoOpen || unreadCount > 0)) markOpened?.();
  }, [open, onPage, autoOpen, unreadCount, markOpened]);

  if (!inbox) return null;

  const seeAll = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey)
      return;
    event.preventDefault();
    setOpen(false);
    navigate({ name: "notifications" });
  };

  return (
    <Popover.Root
      onOpenChange={(next) => {
        openedByItself.current = false;
        setOpen(next);
      }}
      open={open}
    >
      <Popover.Trigger asChild>
        <button
          aria-label={
            unreadCount > 0
              ? `Notificaciones, ${unreadCount} sin leer`
              : "Notificaciones"
          }
          className="topbar-bell"
          title="Notificaciones"
          type="button"
        >
          <Icon name="bell" size={18} />
          {unreadCount > 0 ? (
            <span aria-hidden="true" className="topbar-bell-badge">
              {badgeText(unreadCount)}
            </span>
          ) : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          aria-label="Notificaciones"
          className="notif-popover"
          collisionPadding={12}
          onCloseAutoFocus={(event) => {
            // Closed by itself: the focus stays where the person was, with
            // no ring left on the bell.
            if (openedByItself.current) event.preventDefault();
          }}
          onFocus={() => setEngaged(true)}
          onPointerEnter={() => setEngaged(true)}
          onOpenAutoFocus={(event) => {
            // Never the first button («Marcar todas como leídas»): an Enter
            // meant for something else would clear the bell. Opened by the
            // person, focus goes to the panel itself; opened on its own,
            // focus stays where it was.
            event.preventDefault();
            if (!openedByItself.current) contentRef.current?.focus();
          }}
          ref={contentRef}
          sideOffset={8}
        >
          <NotificationPanelView
            error={inbox.error}
            isLoading={inbox.isLoading}
            items={inbox.items}
            currentWorkspaceId={workspace.id}
            navigate={navigate}
            onSelectWorkspace={selectWorkspace}
            onMarkAllRead={inbox.markAllRead}
            onNavigate={() => setOpen(false)}
            onRead={(notification) => inbox.markRead(notification.id)}
            onRetry={() => void inbox.refresh()}
            onSeeAll={seeAll}
            seeAllHref={routePath({ name: "notifications" })}
            unreadCount={unreadCount}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The bell's panel, without state (rendered in tests). */
export function NotificationPanelView({
  navigate,
  items,
  unreadCount,
  isLoading,
  error,
  onRead,
  onMarkAllRead,
  onNavigate,
  onRetry,
  onSeeAll,
  seeAllHref,
  currentWorkspaceId = null,
  onSelectWorkspace,
}: {
  currentWorkspaceId?: string | null;
  onSelectWorkspace?: (workspaceId: string) => void;
  navigate: (route: Route) => void;
  items: readonly Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: boolean;
  onRead: (notification: Notification) => void;
  onMarkAllRead: () => void;
  onNavigate: () => void;
  onRetry: () => void;
  onSeeAll: (event: MouseEvent<HTMLAnchorElement>) => void;
  seeAllHref: string;
}) {
  return (
    <div className="notif-panel">
      <header className="notif-panel-head">
        <h2>Notificaciones</h2>
        {unreadCount > 0 ? (
          <span className="notif-unread-chip">{unreadCount} sin leer</span>
        ) : null}
        {unreadCount > 0 ? (
          <button
            className="notif-link-button"
            onClick={onMarkAllRead}
            type="button"
          >
            Marcar todas como leídas
          </button>
        ) : null}
      </header>
      <div className="notif-panel-list">
        {isLoading && items.length === 0 ? (
          <p className="notif-empty">Cargando…</p>
        ) : error && items.length === 0 ? (
          <div className="notif-empty">
            <p>No pudimos cargar tus notificaciones.</p>
            <button
              className="button button-secondary button-small"
              onClick={onRetry}
              type="button"
            >
              Reintentar
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="notif-empty">
            <span aria-hidden="true" className="notif-empty-icon">
              <Icon name="bell" size={20} />
            </span>
            <p className="notif-empty-title">No tienes notificaciones</p>
            <p>
              Aquí verás los avisos de Kardo: novedades, mantenimientos y
              mensajes para tu cuenta.
            </p>
          </div>
        ) : (
          items.map((notification) => (
            <NotificationItem
              currentWorkspaceId={currentWorkspaceId}
              key={notification.id}
              navigate={navigate}
              notification={notification}
              onSelectWorkspace={onSelectWorkspace}
              onNavigate={onNavigate}
              onRead={onRead}
            />
          ))
        )}
      </div>
      <footer className="notif-panel-foot">
        <a className="notif-see-all" href={seeAllHref} onClick={onSeeAll}>
          Ver todas
          <Icon name="arrow-right" size={14} />
        </a>
      </footer>
    </div>
  );
}
