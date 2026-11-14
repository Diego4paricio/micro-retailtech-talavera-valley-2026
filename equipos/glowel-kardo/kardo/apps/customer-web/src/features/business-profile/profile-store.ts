import type { WorkspaceProfile, WorkspaceProfilePatch } from "@kardo/contracts";
import {
  type SetStateAction,
  useCallback,
  useEffect,
  useSyncExternalStore,
} from "react";
import { workspaceProfileApi } from "../../api/workspace-profile.js";
import { errorMessage, isAbortError } from "../../lib/api.js";
import type { Resource } from "../../lib/use-resource.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";

/**
 * The organization's business profile (giro, WhatsApp, horario, logo,
 * colores, «Sobre tu negocio»), held ONCE per organization for the whole
 * panel (domain audit 2026-10-13, A2-2 and A2-3). Before, each of ~20
 * screens loaded its own copy, so a new logo saved in Marca did not reach
 * the side menu until a reload, and every screen asked for it again.
 */
type Snapshot = {
  data: WorkspaceProfile | null;
  error: string | null;
  isLoading: boolean;
};

type Entry = {
  snapshot: Snapshot;
  listeners: Set<() => void>;
  inflight: Promise<void> | null;
  /** When the stored copy was last read from the server (ms). */
  loadedAt: number;
};

/** A screen that opens later re-reads a copy older than this, so a change
 * made by someone else shows up without a reload. */
const FRESH_MS = 60_000;

const entries = new Map<string, Entry>();
const idle: Snapshot = { data: null, error: null, isLoading: true };

function entryFor(workspaceId: string): Entry {
  let entry = entries.get(workspaceId);
  if (!entry) {
    entry = {
      snapshot: idle,
      listeners: new Set(),
      inflight: null,
      loadedAt: 0,
    };
    entries.set(workspaceId, entry);
  }
  return entry;
}

function publish(workspaceId: string, next: Partial<Snapshot>) {
  const entry = entryFor(workspaceId);
  entry.snapshot = { ...entry.snapshot, ...next };
  for (const listener of entry.listeners) listener();
}

/** Loads (or reloads) the profile; concurrent callers share one request. */
export function loadWorkspaceProfile(
  workspaceId: string,
  options: { force?: boolean } = {},
): Promise<void> {
  const entry = entryFor(workspaceId);
  if (entry.inflight) return entry.inflight;
  if (
    !options.force &&
    entry.snapshot.data &&
    Date.now() - entry.loadedAt < FRESH_MS
  )
    return Promise.resolve();
  publish(workspaceId, { isLoading: true, error: null });
  const request = workspaceProfileApi
    .get(workspaceId)
    .then((profile) => {
      entry.loadedAt = Date.now();
      publish(workspaceId, { data: profile });
    })
    .catch((cause: unknown) => {
      if (!isAbortError(cause))
        publish(workspaceId, { error: errorMessage(cause) });
    })
    .finally(() => {
      entry.inflight = null;
      publish(workspaceId, { isLoading: false });
    });
  entry.inflight = request;
  return request;
}

/** Replaces the shared copy (after a save elsewhere); every screen updates. */
export function setWorkspaceProfile(
  workspaceId: string,
  update: SetStateAction<WorkspaceProfile | null>,
) {
  const entry = entryFor(workspaceId);
  const data =
    typeof update === "function" ? update(entry.snapshot.data) : update;
  entry.loadedAt = Date.now();
  publish(workspaceId, { data, error: null });
}

/**
 * Saves only the fields in `patch` (the server merges; `null` removes) and
 * puts the stored result in the shared copy. Never send the whole profile:
 * that is how one screen erased another's changes (A2-1).
 */
export async function saveWorkspaceProfile(
  workspaceId: string,
  patch: WorkspaceProfilePatch,
): Promise<WorkspaceProfile> {
  const saved = await workspaceProfileApi.patch(workspaceId, patch);
  setWorkspaceProfile(workspaceId, saved);
  return saved;
}

/** Drops every cached profile (sign-out, account switch). */
export function clearWorkspaceProfiles() {
  entries.clear();
}

function useProfileSnapshot(workspaceId: string): Snapshot {
  const subscribe = useCallback(
    (listener: () => void) => {
      const entry = entryFor(workspaceId);
      entry.listeners.add(listener);
      return () => entry.listeners.delete(listener);
    },
    [workspaceId],
  );
  const read = useCallback(() => entryFor(workspaceId).snapshot, [workspaceId]);
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * The current organization's business profile, shared by every screen.
 * Same shape as `useResource`, so `setData` and `reload` keep working, but
 * both act on the one shared copy.
 */
export function useWorkspaceProfile(): Resource<WorkspaceProfile> {
  const { workspace } = useWorkspace();
  const workspaceId = workspace.id;
  const snapshot = useProfileSnapshot(workspaceId);
  useEffect(() => {
    void loadWorkspaceProfile(workspaceId);
  }, [workspaceId]);
  const reload = useCallback(
    () => loadWorkspaceProfile(workspaceId, { force: true }),
    [workspaceId],
  );
  const setData = useCallback(
    (update: SetStateAction<WorkspaceProfile | null>) =>
      setWorkspaceProfile(workspaceId, update),
    [workspaceId],
  );
  return {
    data: snapshot.data,
    error: snapshot.error,
    isLoading: snapshot.isLoading && !snapshot.data,
    reload,
    setData,
  };
}

/** `saveWorkspaceProfile` bound to the current organization. */
export function useSaveWorkspaceProfile() {
  const { workspace } = useWorkspace();
  const workspaceId = workspace.id;
  return useCallback(
    (patch: WorkspaceProfilePatch) => saveWorkspaceProfile(workspaceId, patch),
    [workspaceId],
  );
}

/**
 * A form's fields as a patch: a field present with `undefined` (emptied in
 * the form) becomes `null`, so the server removes it; fields not present
 * stay as stored.
 */
export function profilePatchFrom(
  fields: {
    [Key in keyof WorkspaceProfile]?: WorkspaceProfile[Key] | undefined;
  },
): WorkspaceProfilePatch {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields))
    patch[key] = value === undefined ? null : value;
  return patch as WorkspaceProfilePatch;
}
