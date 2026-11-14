import {
  checkNotificationAudience,
  type NotificationAudience,
  type NotificationAudienceEstimate,
} from "@kardo/contracts";
import { useEffect, useState } from "react";
import { notificationsApi } from "../../api/notifications.js";
import { errorMessage, isAbortError } from "../../lib/api.js";
import { useDebouncedValue } from "../../lib/use-debounced-value.js";

export type EstimateState = {
  estimate: NotificationAudienceEstimate | null;
  isLoading: boolean;
  error: string | null;
};

/** Debounced estimate of how many people an audience reaches. */
export function useAudienceEstimate(audience: NotificationAudience) {
  const key = JSON.stringify(audience);
  const debouncedKey = useDebouncedValue(key, 400);
  const [state, setState] = useState<EstimateState>({
    estimate: null,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    const parsed = JSON.parse(debouncedKey) as NotificationAudience;
    if (checkNotificationAudience(parsed)) {
      setState({ estimate: null, isLoading: false, error: null });
      return;
    }
    const controller = new AbortController();
    setState((current) => ({ ...current, isLoading: true, error: null }));
    notificationsApi
      .estimate(parsed, controller.signal)
      .then((estimate) => setState({ estimate, isLoading: false, error: null }))
      .catch((requestError: unknown) => {
        if (isAbortError(requestError)) return;
        setState({
          estimate: null,
          isLoading: false,
          error: errorMessage(requestError),
        });
      });
    return () => controller.abort();
  }, [debouncedKey]);

  // While the debounce is pending the shown number belongs to the old audience.
  const isStale = key !== debouncedKey;
  return { ...state, isLoading: state.isLoading || isStale };
}
