import type { CustomerProfile } from "@kardo/contracts";
import { useEffect, useSyncExternalStore } from "react";
import { profileApi } from "../api/workspaces.js";
import { supabase } from "../supabase.js";
import { setDatePreferences } from "./date-preferences.js";

/**
 * The signed-in person's profile and preferences (ADR 023), loaded once per
 * session and shared by every screen: the greeting uses the preferred name,
 * and dates and hours follow the chosen zone and format. Saving a change in
 * Configuración updates every reader at once.
 */
type State = {
  userId: string | null;
  profile: CustomerProfile | null;
  error: string | null;
};

let state: State = { userId: null, profile: null, error: null };
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: State) {
  state = next;
  setDatePreferences({
    timeZone: next.profile?.timeZone ?? undefined,
    hourCycle: next.profile?.hourCycle ?? undefined,
  });
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAccountProfile(): CustomerProfile | null {
  return state.profile;
}

/** Loads the profile of `userId` unless it is already here or on its way. */
export function loadAccountProfile(userId: string): Promise<void> {
  if (state.userId === userId && (state.profile || pending))
    return pending ?? Promise.resolve();
  if (state.userId !== userId) emit({ userId, profile: null, error: null });
  pending = profileApi.get().then(
    (profile) => {
      if (state.userId === userId) emit({ userId, profile, error: null });
    },
    (error: unknown) => {
      if (state.userId === userId)
        emit({
          userId,
          profile: null,
          error:
            error instanceof Error
              ? error.message
              : "No pudimos cargar tu perfil.",
        });
    },
  );
  void pending.finally(() => {
    pending = null;
  });
  return pending;
}

/** After a successful PATCH: every screen sees the new values. */
export function setAccountProfile(profile: CustomerProfile) {
  emit({ ...state, profile, error: null });
}

export function useAccountProfile(userId: string): {
  profile: CustomerProfile | null;
  error: string | null;
  reload: () => Promise<void>;
} {
  const snapshot = useSyncExternalStore(subscribe, () => state);
  useEffect(() => {
    void loadAccountProfile(userId);
  }, [userId]);
  return {
    profile: snapshot.userId === userId ? snapshot.profile : null,
    error: snapshot.userId === userId ? snapshot.error : null,
    reload: () => {
      emit({ userId, profile: null, error: null });
      return loadAccountProfile(userId);
    },
  };
}

/** The name Kardo greets with: the preferred one, else the whole name. */
export function greetingName(profile: CustomerProfile | null): string | null {
  const preferred = profile?.preferredName?.replace(/\s+/g, " ").trim();
  if (preferred) return preferred;
  const name = (profile?.displayName ?? "").replace(/\s+/g, " ").trim();
  return name || null;
}

/**
 * Copies the person's names to their account's own data, which Supabase's
 * emails read (`.Data.preferred_name`) to greet them (owner, 2026-10-04).
 * Best effort: the profile already saved them, and an email without the
 * name still reads well.
 */
export async function syncEmailNames(names: {
  display_name?: string | null;
  preferred_name?: string | null;
  /** The giro picked at sign-up (display-only; the organization's own giro
   * is saved by the server). */
  business_type?: string | null;
}): Promise<void> {
  try {
    await supabase?.auth.updateUser({ data: names });
  } catch {
    // The profile is the source of truth; the email greeting just waits.
  }
}
