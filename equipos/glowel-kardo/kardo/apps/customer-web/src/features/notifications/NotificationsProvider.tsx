import type { Notification } from "@kardo/contracts";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { notificationsApi } from "../../api/notifications.js";
import { isAbortError } from "../../lib/api.js";
import { markReadLocally } from "./model.js";

/** How often the bell asks again while the tab is visible. */
export const NOTIFICATIONS_REFRESH_MS = 5 * 60_000;
/** Items the bell shows; the page loads the rest. */
export const BELL_LIMIT = 8;

type NotificationsState = {
  items: Notification[];
  unreadCount: number;
  /** The bell should open on its own (once). */
  autoOpen: boolean;
  isLoading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
  /** `wasUnread`: the caller's own view, for items outside the bell's list. */
  markRead: (id: string, wasUnread?: boolean) => void;
  markAllRead: () => void;
  /** The person opened the bell: it stops opening on its own. */
  markOpened: () => void;
};

const NotificationsContext = createContext<NotificationsState | null>(null);

/**
 * The bell's data (ADR 022): the latest notifications, the unread count and
 * whether to open on its own. Asked on entry, every 5 minutes while the tab
 * is visible and when the person comes back to it. Read marks are applied
 * here first (optimistic) so the bell and the page agree at once.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [autoOpen, setAutoOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    try {
      const inbox = await notificationsApi.inbox(
        { limit: BELL_LIMIT },
        current.signal,
      );
      setItems(inbox.items);
      setUnreadCount(inbox.unreadCount);
      setAutoOpen(inbox.autoOpen);
      setError(false);
    } catch (caught) {
      if (isAbortError(caught)) return;
      // The bell is not worth an error toast: it says so inside.
      setError(true);
    } finally {
      if (controller.current === current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, NOTIFICATIONS_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      controller.current?.abort();
    };
  }, [refresh]);

  // Mirror of `items` for the read count: decided outside state updaters.
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const markRead = useCallback((id: string, wasUnread = false) => {
    const known = itemsRef.current.find((item) => item.id === id);
    // In the bell's list: its own mark decides. Only on the page (older
    // than the bell's eight): the page says whether it was unread.
    const counts = known ? known.readAt === null : wasUnread;
    if (known?.readAt === null) {
      setItems((current) =>
        markReadLocally(current, new Set([id]), new Date().toISOString()),
      );
    }
    if (counts) setUnreadCount((count) => Math.max(0, count - 1));
    notificationsApi.markRead(id).catch(() => undefined);
  }, []);

  const markAllRead = useCallback(() => {
    setItems((current) =>
      markReadLocally(current, "all", new Date().toISOString()),
    );
    setUnreadCount(0);
    notificationsApi
      .markAllRead()
      .catch(() => undefined)
      .finally(() => void refresh());
  }, [refresh]);

  const markOpened = useCallback(() => {
    setAutoOpen(false);
    notificationsApi.markOpened().catch(() => undefined);
  }, []);

  const value = useMemo<NotificationsState>(
    () => ({
      items,
      unreadCount,
      autoOpen,
      isLoading,
      error,
      refresh,
      markRead,
      markAllRead,
      markOpened,
    }),
    [
      items,
      unreadCount,
      autoOpen,
      isLoading,
      error,
      refresh,
      markRead,
      markAllRead,
      markOpened,
    ],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

/** `null` outside the workspace shell. */
export function useNotifications(): NotificationsState | null {
  return useContext(NotificationsContext);
}
