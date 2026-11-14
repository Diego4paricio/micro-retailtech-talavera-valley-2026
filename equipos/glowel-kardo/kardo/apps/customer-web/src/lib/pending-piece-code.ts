import { isPieceCodeShape, normalizePieceCode } from "@kardo/contracts";

/**
 * The code of a Kardo piece that arrived in the address (`/activar?codigo=`,
 * the QR of the activation card that comes with a kit; ADR 026). It waits in
 * this tab's session storage while the person signs in or creates an
 * account, like the plan from /precios/ (signup-plan.ts), so the sign up
 * ends on «Producto de Kardo» with the code already written. Cleared once
 * the pieces are activated.
 */
const key = "kardo.pending-piece-code";

/** The code in an `/activar` address; null for anything else. */
export function pieceCodeFrom(location: {
  pathname: string;
  search: string;
}): string | null {
  const path = location.pathname.replace(/\/+$/, "");
  if (path !== "/activar") return null;
  const raw = new URLSearchParams(location.search).get("codigo") ?? "";
  return isPieceCodeShape(raw) ? normalizePieceCode(raw) : null;
}

export function capturePendingPieceCode(location: {
  pathname: string;
  search: string;
}): string | null {
  const code = pieceCodeFrom(location);
  if (!code) return null;
  try {
    window.sessionStorage.setItem(key, code);
  } catch {
    // Without storage the address still carries the code.
  }
  return code;
}

export function readPendingPieceCode(): string | null {
  try {
    const value = window.sessionStorage.getItem(key);
    return value && isPieceCodeShape(value) ? normalizePieceCode(value) : null;
  } catch {
    return null;
  }
}

export function clearPendingPieceCode(): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Nothing stored.
  }
}
