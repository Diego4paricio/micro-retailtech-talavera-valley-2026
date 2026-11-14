/**
 * An invitation link (`/invite#token=…`) opened before signing in (relevo
 * 20, T3). The token waits in this tab's session storage while the person
 * creates an account or signs in, so a new account goes straight to the
 * invitation instead of the sign-up questions about a business of its own.
 * Cleared once accepted or refused.
 */
const key = "kardo.pending-invitation";
export const invitationTokenPattern = /^[A-Za-z0-9_-]{32,128}$/;

/** Reads the token from the invitation address; null for anything else. */
export function invitationTokenFrom(location: {
  pathname: string;
  hash: string;
}): string | null {
  const path = location.pathname.replace(/\/+$/, "");
  if (path !== "/invite") return null;
  const match = /^#token=([^&]+)/.exec(location.hash);
  const raw = match?.[1] ? safeDecode(match[1]) : null;
  return raw && invitationTokenPattern.test(raw) ? raw : null;
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function capturePendingInvitation(location: {
  pathname: string;
  hash: string;
}): boolean {
  const token = invitationTokenFrom(location);
  if (!token) return false;
  try {
    window.sessionStorage.setItem(key, token);
  } catch {
    // Without storage the address still carries the token.
  }
  return true;
}

export function readPendingInvitation(): string | null {
  try {
    const value = window.sessionStorage.getItem(key);
    return value && invitationTokenPattern.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function clearPendingInvitation(): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}
