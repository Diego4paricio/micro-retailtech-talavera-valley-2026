import type { ExperienceType } from "@kardo/contracts";
import type { ReactNode } from "react";

/**
 * The one icon per page type, drawn for Primeros pasos (owner, 2026-10-04:
 * «íconos propios, no los de la librería»): two tones, the tint as fill, the
 * teal as line and the aqua as accent (`.fsi-*` in styles/first-steps.css),
 * on a 48 grid. Primeros pasos, Páginas and Links all use it, so a type
 * looks the same everywhere (domain audit 2026-10-13, A2-58).
 */

const pageIcons: Record<ExperienceType, ReactNode> = {
  menu: (
    <>
      <rect className="fsi-f" height="38" rx="5" width="28" x="10" y="5" />
      <path className="fsi-l" d="M16 14h16" />
      <path className="fsi-l" d="M16 21.5h9M16 28h9M16 34.5h9" />
      <path className="fsi-a" d="M29.5 21.5h2.5M29.5 28h2.5M29.5 34.5h2.5" />
    </>
  ),
  catalog: (
    <>
      <path
        className="fsi-f"
        d="M6.5 24.5 22 9h15a2 2 0 0 1 2 2v15L23.5 41.5a3 3 0 0 1-4.2 0L6.5 28.7a3 3 0 0 1 0-4.2Z"
      />
      <circle className="fsi-af" cx="31.5" cy="16.5" r="3" />
      <path className="fsi-l" d="M16 27.5l6.5-6.5M20 31.5l5-5" />
    </>
  ),
  document: (
    <>
      <path
        className="fsi-f"
        d="M13 5h16l9 9v26a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z"
      />
      <path className="fsi-l" d="M29 5v9h9" />
      <rect className="fsi-af" height="12" rx="3" width="25" x="5" y="23" />
      <text className="fsi-label" textAnchor="middle" x="17.5" y="31.6">
        PDF
      </text>
    </>
  ),
  image: (
    <>
      <rect className="fsi-f" height="30" rx="5" width="36" x="6" y="9" />
      <circle className="fsi-af" cx="17" cy="19" r="3.6" />
      <path className="fsi-l" d="m7 35 10.5-10.5 7 7 5-5L40 37" />
    </>
  ),
  profile: (
    <>
      <rect className="fsi-f" height="28" rx="5" width="38" x="5" y="10" />
      <circle className="fsi-af" cx="16" cy="21" r="4.6" />
      <path
        className="fsi-l"
        d="M10.5 31.5c1.4-2.6 3.3-3.8 5.5-3.8s4.1 1.2 5.5 3.8"
      />
      <path className="fsi-l" d="M27 19h10M27 25h7" />
    </>
  ),
  linkpage: (
    <>
      <circle className="fsi-af" cx="24" cy="10.5" r="6.5" />
      <rect className="fsi-f" height="6.5" rx="3.25" width="32" x="8" y="21" />
      <rect
        className="fsi-f"
        height="6.5"
        rx="3.25"
        width="32"
        x="8"
        y="30.5"
      />
      <rect className="fsi-f" height="6.5" rx="3.25" width="32" x="8" y="40" />
    </>
  ),
  links: (
    <>
      <circle className="fsi-af" cx="24" cy="10.5" r="6.5" />
      <rect className="fsi-f" height="6.5" rx="3.25" width="32" x="8" y="21" />
      <rect
        className="fsi-f"
        height="6.5"
        rx="3.25"
        width="32"
        x="8"
        y="30.5"
      />
      <rect className="fsi-f" height="6.5" rx="3.25" width="32" x="8" y="40" />
    </>
  ),
  form: (
    <>
      <rect className="fsi-f" height="36" rx="5" width="30" x="9" y="7" />
      <rect className="fsi-w" height="7" rx="2.5" width="14" x="17" y="3.5" />
      <rect className="fsi-w" height="6" rx="1.5" width="6" x="14.5" y="17" />
      <path className="fsi-a" d="m15.8 20 1.6 1.6 2.6-3" />
      <path className="fsi-l" d="M24.5 20h9" />
      <rect className="fsi-w" height="6" rx="1.5" width="6" x="14.5" y="28" />
      <path className="fsi-l" d="M24.5 31h9" />
    </>
  ),
  redirect: (
    <>
      <rect className="fsi-f" height="30" rx="5" width="38" x="5" y="9" />
      <path className="fsi-l" d="M5 17h38" />
      <circle className="fsi-lf" cx="10" cy="13" r="1.3" />
      <circle className="fsi-lf" cx="14.5" cy="13" r="1.3" />
      <path className="fsi-a" d="M19.5 32 29.5 22M23 22h6.5v6.5" />
    </>
  ),
};

export function PageTypeIcon({
  type,
  size,
}: {
  type: ExperienceType;
  /** Side in pixels; by default the CSS decides (`.fsi`). */
  size?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      className="fsi"
      height={size}
      viewBox="0 0 48 48"
      width={size}
    >
      {pageIcons[type]}
    </svg>
  );
}
