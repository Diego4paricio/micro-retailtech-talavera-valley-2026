import type { DesignAmbient, DesignStyle } from "@kardo/contracts";
import { clampInt, hex, relativeLuminance } from "./css.js";
import { safeCssUrl } from "./url-safety.js";

// ---------------------------------------------------------------------------
// The blurred backdrop behind a designed page ("fondo difuminado", ADR 018
// addendum 3): a fixed, non-interactive layer (`position:fixed; inset:0;
// z-index:-1`, with `isolation:isolate` on `.kd-page` so it stacks correctly)
// painted with soft blurred glows, so a computer-sized viewport never shows a
// flat empty strip and the gaps between cards/sections read as part of the
// design instead of a blank background. Colors for `ambient: "auto"` are
// plain hex arithmetic — channel-wise mixing in sRGB, the same math
// `color-mix(in srgb, …)` performs — so the part that actually matters
// (choosing glow colors that contrast with the card surface) needs no CSS
// color-mix support; the generated CSS itself is a handful of validated
// declarations (background, radial blur, opacity), nothing exotic.
// ---------------------------------------------------------------------------

function channelAt(hexColor: string, index: number): number {
  return Number.parseInt(hexColor.slice(1 + index * 2, 3 + index * 2), 16);
}

function toChannelHex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0");
}

/** Channel-wise mix of two already-validated `#rrggbb` colors (`weightB`
 * clamped to 0–1: 0 keeps `colorA`, 1 keeps `colorB`). */
export function mixHex(
  colorA: string,
  colorB: string,
  weightB: number,
): string {
  const w = Math.max(0, Math.min(1, weightB));
  const mix = (index: number) =>
    channelAt(colorA, index) * (1 - w) + channelAt(colorB, index) * w;
  return `#${toChannelHex(mix(0))}${toChannelHex(mix(1))}${toChannelHex(mix(2))}`;
}

export function lightenHex(color: string, amount: number): string {
  return mixHex(color, "#ffffff", amount);
}

export function darkenHex(color: string, amount: number): string {
  return mixHex(color, "#000000", amount);
}

/**
 * Two glow colors derived from the palette for `ambient: "auto"`: the accent,
 * and a blend of the background toward the accent, each pushed away from the
 * card surface's own lightness (darkened over a light surface, lightened
 * over a dark one) whenever they would otherwise read too close to it — the
 * point of the whole layer is that cards stand out against it.
 */
export function ambientAutoColors(style: DesignStyle): {
  colorA: string;
  colorB: string;
} {
  const accent = hex(style.palette.accent, "#0a6c78");
  const background = hex(style.palette.background, "#f7f5f0");
  const surface = hex(style.palette.surface, "#fffdf8");
  const surfaceLum = relativeLuminance(surface);
  const pushAwayFromSurface = (color: string): string => {
    if (Math.abs(relativeLuminance(color) - surfaceLum) >= 0.16) return color;
    return surfaceLum >= 0.5 ? darkenHex(color, 0.35) : lightenHex(color, 0.35);
  };
  return {
    colorA: pushAwayFromSurface(accent),
    colorB: pushAwayFromSurface(mixHex(background, accent, 0.4)),
  };
}

function ambientKindOf(
  ambient: DesignAmbient | undefined,
): "auto" | "custom" | "none" {
  return ambient?.kind ?? "auto";
}

/** `false` only for the explicit `"none"` — absent means `"auto"` (ADR 018
 * addendum 3). */
export function isAmbientActive(style: DesignStyle): boolean {
  return ambientKindOf(style.ambient) !== "none";
}

/** Structural rule, added once and only when a design's ambient is active. */
export const ambientBaseCss =
  ".kd-ambient{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden}";

/**
 * CSS for the `.kd-ambient` layer: two blurred glows from the palette (or
 * `custom`'s own colors), or — with an image page background — that same
 * image, blurred and veiled, so the sharp copy the content column keeps
 * (see `pageCss` in `render.ts`) always sits over a softened version of
 * itself instead of a hard edge. `""` when ambient is `"none"`.
 */
export function ambientCss(
  style: DesignStyle,
  resolveImage: (ref: string) => string | null,
): string {
  const kind = ambientKindOf(style.ambient);
  if (kind === "none") return "";
  const strength = clampInt(style.ambient?.strength, 0, 100, 60) / 100;
  const background = hex(style.palette.background, "#f7f5f0");

  if (style.background.kind === "image") {
    const resolved = style.background.imageRef
      ? resolveImage(style.background.imageRef)
      : null;
    const url = resolved ? safeCssUrl(resolved) : null;
    if (url) {
      const overlay = Math.max(
        clampInt(style.background.overlay, 0, 80, 0) / 100,
        0.15,
      );
      return `.kd-ambient{background:${background};background-image:linear-gradient(rgba(0,0,0,${overlay}),rgba(0,0,0,${overlay})),${url};background-size:cover;background-position:center;filter:blur(48px);transform:scale(1.15)}`;
    }
    // Falls through to the color glows below when the image cannot resolve.
  }

  let colorA: string;
  let colorB: string;
  if (kind === "custom") {
    colorA = hex(style.ambient?.color, background);
    colorB = hex(style.ambient?.colorTo, colorA);
  } else {
    const auto = ambientAutoColors(style);
    colorA = auto.colorA;
    colorB = auto.colorB;
  }
  const opacityA = (0.32 + 0.4 * strength).toFixed(2);
  const opacityB = (0.22 + 0.32 * strength).toFixed(2);
  return `
.kd-ambient{background:${background}}
.kd-ambient::before,.kd-ambient::after{content:"";position:absolute;border-radius:50%;filter:blur(90px)}
.kd-ambient::before{width:64vmax;height:64vmax;left:-18vmax;top:-18vmax;background:${colorA};opacity:${opacityA}}
.kd-ambient::after{width:58vmax;height:58vmax;right:-16vmax;bottom:-16vmax;background:${colorB};opacity:${opacityB}}
`;
}

/** The ambient layer's markup — always the page's first child, before
 * `.kd-container`, so it sits behind everything without ever being covered
 * by a canvas section. `""` when ambient is `"none"` (today's behavior). */
export function ambientMarkup(style: DesignStyle): string {
  return isAmbientActive(style)
    ? '<div class="kd-ambient" aria-hidden="true"></div>'
    : "";
}
