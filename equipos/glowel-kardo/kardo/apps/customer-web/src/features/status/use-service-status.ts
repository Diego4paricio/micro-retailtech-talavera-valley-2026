import type { ServiceStatus } from "@kardo/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchServiceStatus, isStatusConfigured } from "../../api/status.js";

/** How often the pill asks again while the tab is visible (ADR 022 §6). */
export const STATUS_REFRESH_MS = 3 * 60_000;

export function useServiceStatus(): {
  configured: boolean;
  status: ServiceStatus | null;
  failed: boolean;
  online: boolean;
  refresh: () => void;
} {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [failed, setFailed] = useState(false);
  // Offline only when the browser says so: `onLine` is missing outside one.
  const [online, setOnline] = useState(
    typeof navigator === "undefined" || navigator.onLine !== false,
  );
  const controller = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    if (!isStatusConfigured) return;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    fetchServiceStatus(current.signal)
      .then((next) => {
        setStatus(next);
        setFailed(false);
      })
      .catch((error: unknown) => {
        if (current.signal.aborted) return;
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setFailed(true);
      });
  }, []);

  useEffect(() => {
    if (!isStatusConfigured) return;
    refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, STATUS_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onOnline = () => {
      setOnline(true);
      refresh();
    };
    const onOffline = () => setOnline(false);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      controller.current?.abort();
    };
  }, [refresh]);

  return { configured: isStatusConfigured, status, failed, online, refresh };
}
