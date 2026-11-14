import type { WorkspaceBilling } from "@kardo/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { billingApi } from "../../api/billing.js";
import { ApiRequestError, errorMessage, isAbortError } from "../../lib/api.js";

export type BillingState =
  | { status: "loading" }
  | { status: "forbidden" }
  | { status: "error"; message: string }
  | { status: "ready"; billing: WorkspaceBilling };

/** Refresh cadence and cap while waiting for the webhook after checkout. */
export const pollEveryMs = 3_000;
export const pollForMs = 30_000;

/**
 * Loads the workspace billing (the plan catalog lives on the Website). With `waitForSubscription`
 * it re-reads the billing every 3 s (up to 30 s) until a subscription shows
 * up: Stripe confirms the purchase through a webhook, which may take a moment.
 */
export function useBilling(
  workspaceId: string,
  options: { waitForSubscription: boolean },
) {
  const [state, setState] = useState<BillingState>({ status: "loading" });
  const [waiting, setWaiting] = useState(options.waitForSubscription);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(
    async (quiet: boolean): Promise<WorkspaceBilling | null> => {
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      if (!quiet) setState({ status: "loading" });
      try {
        const billing = await billingApi.get(workspaceId, current.signal);
        if (current.signal.aborted) return null;
        setState({ status: "ready", billing });
        return billing;
      } catch (error) {
        if (isAbortError(error) || current.signal.aborted) return null;
        if (error instanceof ApiRequestError && error.status === 403)
          setState({ status: "forbidden" });
        else if (!quiet)
          setState({ status: "error", message: errorMessage(error) });
        return null;
      }
    },
    [workspaceId],
  );

  useEffect(() => {
    void load(false);
    return () => controller.current?.abort();
  }, [load]);

  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started >= pollForMs) {
        window.clearInterval(timer);
        setWaiting(false);
        return;
      }
      void load(true).then((billing) => {
        if (billing?.subscription) {
          window.clearInterval(timer);
          setWaiting(false);
        }
      });
    }, pollEveryMs);
    return () => window.clearInterval(timer);
  }, [waiting, load]);

  return {
    state,
    reload: () => load(false),
    /** Fresh numbers without the loading state (after a change on the page). */
    refresh: () => load(true),
    waiting,
  };
}
