import {
  KARDO_ICON_WIDTH,
  KARDO_LOGO_HEIGHT,
  KARDO_LOGO_WIDTH,
  kardoBrandColors,
  kardoIconOutlines,
  kardoLogoOutlines,
} from "./brand-paths.js";
/**
 * Inline brand and social-network SVG icons, shared by the Resolver (its
 * existing, non-designed pages) and this package's own `contentSocials`
 * block rendering. Everything here is a plain string constant or a closed
 * lookup keyed by a validated `SocialNetwork` — never built from untrusted
 * input — so nothing here needs escaping. The Resolver's CSP forbids any
 * external resource (fonts, images, scripts, stylesheets) beyond `'self'`,
 * so every visual asset the public pages use, brand logos included, is
 * inlined as SVG source instead of linked.
 *
 * Icon style: a uniform 24x24 stroke-based line-icon set (in the spirit of
 * common open icon sets, not a trace of any platform's trademarked logo
 * artwork) so the row reads as one coherent system regardless of theme.
 *
 * Moved here from `services/resolver/src/icons.ts` (ADR 018) so the same
 * icons render identically in the Resolver's public pages and this
 * package's designed-page renderer.
 */

import type { SocialNetwork } from "./types.js";

const iconOpen =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">';

const socialIcons: Record<SocialNetwork, string> = {
  instagram: `${iconOpen}<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none"/></svg>`,
  facebook: `${iconOpen}<path d="M15.5 8.5h-2a1.5 1.5 0 0 0-1.5 1.5V12h3.3l-.4 3h-2.9v7h-3v-7H9v-3h2V9.6C11 7.2 12.6 5.5 15 5.5h2.5V8.5z"/></svg>`,
  tiktok: `${iconOpen}<path d="M13 4v10.5a3.5 3.5 0 1 1-3.2-3.49"/><path d="M13 4c.6 2.4 2.4 4.1 5 4.4"/></svg>`,
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M5 5l14 14M19 5 5 19"/></svg>',
  youtube: `${iconOpen}<rect x="3" y="6" width="18" height="12" rx="4"/><path d="M10.5 9.5v5l4.5-2.5z" fill="currentColor" stroke="none"/></svg>`,
  linkedin: `${iconOpen}<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8.2" r="0.6" fill="currentColor" stroke="none"/><path d="M8 11v6M12.5 17v-3.5c0-1.4 1-2.3 2.2-2.3 1.2 0 1.8.8 1.8 2.3V17"/></svg>`,
  whatsapp: `${iconOpen}<path d="M12 3a8 8 0 0 0-6.9 12l-1 4 4.1-1A8 8 0 1 0 12 3z"/><path d="M8.7 8.6c.2-.5.7-1 1.2-1 .3 0 .5.2.7.6l.6 1.3c.1.3 0 .6-.2.8l-.5.5c.4 1 1.2 1.8 2.2 2.2l.5-.5c.2-.2.5-.3.8-.2l1.3.6c.4.2.6.4.6.7 0 .5-.5 1-1 1.2-.9.4-2.2.2-3.6-.9-1.4-1-2.5-2.4-2.9-3.6-.3-.8-.2-1.4.3-1.7z"/></svg>`,
  threads:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><text x="12" y="17" font-size="15" text-anchor="middle" font-family="system-ui, sans-serif" fill="currentColor">@</text></svg>',
  pinterest: `${iconOpen}<circle cx="12" cy="12" r="9"/><path d="M10 17.5 12 8.8m0 0c-2.2 0-3.4 1.3-3.4 2.9 0 1 .5 1.7 1.1 1.9M12 8.8c2.2 0 3.6 1.5 3.6 3.6 0 2.6-1.3 4.4-3.2 4.4-.7 0-1.3-.4-1.5-.9"/></svg>`,
  spotify:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M7.5 10.2c3-1 6.5-.7 9 .8M8 13.2c2.4-.7 5.2-.5 7.2.7M8.5 16c1.8-.5 3.9-.4 5.4.5"/></svg>',
  telegram: `${iconOpen}<path d="M21 4 3 11.5l6 2M21 4l-3.5 16-5.5-4M9 13.5V18l2.7-2.6"/></svg>`,
  website: `${iconOpen}<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 4 5.6 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.6-4-9s1.5-6.5 4-9z"/></svg>`,
  email: `${iconOpen}<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/></svg>`,
  phone: `${iconOpen}<path d="M6.6 3.5 9.3 6a1 1 0 0 1 0 1.4L7.6 9.1a12 12 0 0 0 6.3 6.3l1.7-1.7a1 1 0 0 1 1.4 0l2.5 2.7a1 1 0 0 1-.1 1.4l-1.8 1.6a2 2 0 0 1-1.9.4C11.5 18.6 5.4 12.5 4.2 8.3a2 2 0 0 1 .4-1.9L6.2 4.6a1 1 0 0 1 .4-1.1z"/></svg>`,
};

const socialLabels: Record<SocialNetwork, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  x: "X (Twitter)",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  threads: "Threads",
  pinterest: "Pinterest",
  spotify: "Spotify",
  telegram: "Telegram",
  website: "Sitio web",
  email: "Correo electrónico",
  phone: "Teléfono",
};

/** `network` always comes from the closed, already-validated social union,
 * never from unescaped user text, so returning it verbatim is safe. */
export function socialIcon(network: SocialNetwork): string {
  return socialIcons[network];
}

export function socialLabel(network: SocialNetwork): string {
  return socialLabels[network];
}

// ---------------------------------------------------------------------------
// The official Kardo logo (2026-10-01 masters in Docs/Marca), outlines only,
// never a system-font `<text>`: the KARDO wordmark plus the symbol (ring, dot
// and two signal waves). The outlines come from `brand-paths.ts`, generated
// by scripts/brand/build-brand.mjs; re-run it when the masters change.
//
// `kardoLogoSvg` is for a light background, `kardoLogoDarkSvg` for a dark one
// (the official colors of each master), and `kardoLogoMonoSvg` (currentColor
// throughout) lets a caller inherit whichever color it already has.
// ---------------------------------------------------------------------------

type LogoPalette = { ink: string; inner: string; outer: string };

function outlinesSvg(
  width: number,
  palette: LogoPalette,
  withLetters: boolean,
): string {
  const outlines = withLetters ? kardoLogoOutlines : kardoIconOutlines;
  const letters = withLetters
    ? outlines.letters
        .map((d) => `<path fill="${palette.ink}" d="${d}"/>`)
        .join("")
    : "";
  return `<svg viewBox="0 0 ${width} ${KARDO_LOGO_HEIGHT}" role="img" aria-label="Kardo" focusable="false">${letters}<path fill="${palette.ink}" d="${outlines.ring}"/><path fill="${palette.ink}" d="${outlines.dot}"/><path fill="${palette.outer}" d="${outlines.outer}"/><path fill="${palette.inner}" d="${outlines.inner}"/></svg>`;
}

const monoPalette: LogoPalette = {
  ink: "currentColor",
  inner: "currentColor",
  outer: "currentColor",
};

/** Light backgrounds (official light master colors). */
export const kardoLogoSvg = outlinesSvg(
  KARDO_LOGO_WIDTH,
  kardoBrandColors.light,
  true,
);
/** Dark backgrounds (official dark master colors). */
export const kardoLogoDarkSvg = outlinesSvg(
  KARDO_LOGO_WIDTH,
  kardoBrandColors.dark,
  true,
);
/** Inherits the caller's own text color throughout. */
export const kardoLogoMonoSvg = outlinesSvg(
  KARDO_LOGO_WIDTH,
  monoPalette,
  true,
);
/** The symbol alone (ring, dot and signal), for light backgrounds. */
export const kardoIconSvg = outlinesSvg(
  KARDO_ICON_WIDTH,
  kardoBrandColors.light,
  false,
);
