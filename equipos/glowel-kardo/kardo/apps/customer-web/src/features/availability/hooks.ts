import { useEffect, useState, useSyncExternalStore } from "react";
import { availabilityApi } from "../../api/availability.js";
import { ApiRequestError } from "../../lib/api.js";
import { availabilityErrorMessage } from "./model.js";
import { AvailabilityStore, type StoreSnapshot } from "./store.js";

// One store per workspace for the whole session: saves still in flight when
// the page closes finish in the background, and reopening the page shows the
// last known state at once while it refreshes.
const stores = new Map<string, AvailabilityStore>();

export function availabilityStoreFor(workspaceId: string): AvailabilityStore {
  let store = stores.get(workspaceId);
  if (!store) {
    store = new AvailabilityStore(
      {
        load: (signal) => availabilityApi.overview(workspaceId, signal),
        save: (experienceId, body) =>
          availabilityApi.save(workspaceId, experienceId, body),
      },
      {
        describeError: availabilityErrorMessage,
        requiresRefresh: (error) =>
          error instanceof ApiRequestError &&
          (error.code === "EXPERIENCE_ARCHIVED" || error.status === 404),
      },
    );
    stores.set(workspaceId, store);
  }
  return store;
}

export function useAvailabilityStore(workspaceId: string): {
  store: AvailabilityStore;
  snapshot: StoreSnapshot;
} {
  const store = availabilityStoreFor(workspaceId);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { store, snapshot };
}

/** The current time, refreshed on an interval (relative "hace …" labels). */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
