import type { ReactNode } from "react";

// The page type icons moved to `components/PageTypeIcon.tsx` (A2-58); this
// keeps the old import working.
export { PageTypeIcon } from "../../components/PageTypeIcon.js";

/**
 * Icons drawn for Primeros pasos (owner, 2026-10-04: «íconos propios, no
 * los de la librería»): QR, NFC and link of step 4 on a 64 grid, with the
 * symbols people already know. Same two tones as the page types.
 */

export type ShareIconKind = "qr" | "nfc" | "link";

const shareIcons: Record<ShareIconKind, ReactNode> = {
  qr: (
    <>
      <rect className="fsi-f" height="52" rx="10" width="52" x="6" y="6" />
      <rect className="fsi-w" height="15" rx="3" width="15" x="13" y="13" />
      <rect
        className="fsi-lf"
        height="6"
        rx="1.2"
        width="6"
        x="17.5"
        y="17.5"
      />
      <rect className="fsi-w" height="15" rx="3" width="15" x="36" y="13" />
      <rect
        className="fsi-lf"
        height="6"
        rx="1.2"
        width="6"
        x="40.5"
        y="17.5"
      />
      <rect className="fsi-w" height="15" rx="3" width="15" x="13" y="36" />
      <rect
        className="fsi-lf"
        height="6"
        rx="1.2"
        width="6"
        x="17.5"
        y="40.5"
      />
      <rect className="fsi-lf" height="5" rx="1" width="5" x="36" y="36" />
      <rect className="fsi-af" height="5" rx="1" width="7" x="44" y="36" />
      <rect className="fsi-af" height="7" rx="1" width="5" x="36" y="44" />
      <rect className="fsi-lf" height="7" rx="1" width="7" x="44" y="44" />
    </>
  ),
  // Android's NFC symbol: Material Icons «nfc» (Google, Apache License
  // 2.0). The NFC Forum's N-Mark needs a license and belongs on the tag
  // itself, not in a screen (relevo 33).
  nfc: (
    <>
      <rect className="fsi-tile" height="44" rx="7" width="44" x="10" y="10" />
      <path
        className="fsi-lf"
        d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H4V4h16v16zM18 6h-5c-1.1 0-2 .9-2 2v2.28c-.6.35-1 .98-1 1.72 0 1.1.9 2 2 2s2-.9 2-2c0-.74-.4-1.38-1-1.72V8h3v8H8V8h2V6H6v12h12V6z"
        transform="translate(8 8) scale(2)"
      />
    </>
  ),
  link: (
    <>
      <rect className="fsi-f" height="52" rx="10" width="52" x="6" y="6" />
      <path
        className="fsi-l"
        d="M29.5 36.5 26 40a7 7 0 0 1-10-10l5-5a7 7 0 0 1 10 0"
      />
      <path
        className="fsi-l"
        d="M34.5 27.5 38 24a7 7 0 0 1 10 10l-5 5a7 7 0 0 1-10 0"
      />
      <path className="fsi-a" d="m27 37 10-10" />
    </>
  ),
};

export function ShareIcon({ kind }: { kind: ShareIconKind }) {
  return (
    <svg aria-hidden="true" className="fsi" viewBox="0 0 64 64">
      {shareIcons[kind]}
    </svg>
  );
}
