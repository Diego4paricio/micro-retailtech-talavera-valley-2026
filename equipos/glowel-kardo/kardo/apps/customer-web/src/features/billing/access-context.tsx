import type { WorkspaceAccess } from "@kardo/contracts";
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
import { accessApi } from "../../api/access.js";
import { isAbortError } from "../../lib/api.js";

type AccessValue = {
  /** Null while loading or when the read failed: no screen depends on it. */
  access: WorkspaceAccess | null;
  refresh: () => Promise<void>;
};

const AccessContext = createContext<AccessValue>({
  access: null,
  refresh: async () => {},
});

/** Reads the access state of the current organization. */
export function useAccess(): AccessValue {
  return useContext(AccessContext);
}

const pollEveryMs = 3_000;
const pollForMs = 30_000;
/** Focus events closer than this reuse the last read. */
const focusThrottleMs = 5_000;

function returnedFromCheckout(): boolean {
  try {
    const result = new URLSearchParams(window.location.search).get("checkout");
    // `return`: the embedded Checkout (relevo 20, T1).
    return result === "success" || result === "return";
  } catch {
    return false;
  }
}

/**
 * Loads `/access` for one organization. The provider is keyed by the
 * organization, so switching it starts a fresh read. It refreshes when the tab
 * regains focus and, after coming back from Checkout, every 3 s (up to 30 s)
 * until the subscription shows as active: Stripe confirms through a webhook.
 */
export function AccessProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const [access, setAccess] = useState<WorkspaceAccess | null>(null);
  const lastRead = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    try {
      const next = await accessApi.get(workspaceId, current.signal);
      if (current.signal.aborted) return;
      lastRead.current = Date.now();
      setAccess(next);
    } catch (error) {
      // A failed read never blocks the panel: keep what was known.
      if (isAbortError(error)) return;
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
    return () => controller.current?.abort();
  }, [load]);

  useEffect(() => {
    const refreshIfStale = () => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastRead.current < focusThrottleMs) return;
      void load();
    };
    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => {
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", refreshIfStale);
    };
  }, [load]);

  const [waitingForCheckout, setWaitingForCheckout] =
    useState(returnedFromCheckout);
  useEffect(() => {
    if (!waitingForCheckout) return;
    if (access?.state === "active") {
      setWaitingForCheckout(false);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started >= pollForMs) {
        window.clearInterval(timer);
        setWaitingForCheckout(false);
        return;
      }
      void load();
    }, pollEveryMs);
    return () => window.clearInterval(timer);
  }, [waitingForCheckout, access?.state, load]);

  const value = useMemo(() => ({ access, refresh: load }), [access, load]);
  return (
    <AccessContext.Provider value={value}>{children}</AccessContext.Provider>
  );
}
