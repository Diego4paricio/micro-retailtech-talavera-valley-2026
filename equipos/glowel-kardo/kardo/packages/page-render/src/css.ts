import type { DesignBackground, DesignFont } from "@kardo/contracts";
import { fontFamilyStack } from "./fonts.js";
import { safeCssUrl } from "./url-safety.js";

// ---------------------------------------------------------------------------
// Every helper in this module maps an already-shaped value (a `PageDesign`'s
// static type only says "string"/"number" — TypeBox's runtime pattern/range
// checks are not carried into TypeScript) to a CSS fragment. Each one still
// re-validates defensively before interpolating anything: a hex color must
// match `#rrggbb`, a number is clamped to its documented range, and an enum
// is resolved through a closed `Record` lookup with a safe fallback — never
// through a template literal on the raw value. This is what "CSS generated
// only from validated values" (ADR 018) means in code.
// ---------------------------------------------------------------------------

const hexPattern = /^#[0-9a-fA-F]{6}$/;

/** A `#rrggbb` value if `value` matches, otherwise `fallback` — never the
 * raw, unchecked string. */
export function hex(value: string | undefined, fallback: string): string {
  return value !== undefined && hexPattern.test(value) ? value : fallback;
}

/** An integer clamped to `[min, max]`, defaulting to `fallback` for anything
 * that is not actually a finite integer. */
export function clampInt(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (value === undefined || !Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** Resolves an enum-like value through a closed lookup, falling back to a
 * known-safe default rather than ever interpolating the raw value. */
export function pick<T extends string, V>(
  value: T | undefined,
  table: Record<T, V>,
  fallback: V,
): V {
  if (value === undefined) return fallback;
  return Object.hasOwn(table, value) ? table[value] : fallback;
}

/** WCAG relative luminance of an already-validated `#rrggbb` color (callers
 * validate with `hex()` first — this does no checking of its own). Shared by
 * `onAccentColor` and the ambient backdrop's auto colors (`ambient.ts`) and
 * the footer's light/dark choice (`footer.ts`), so all three agree on the
 * same "is this color light or dark" rule. */
export function relativeLuminance(hexColor: string): number {
  const value = Number.parseInt(hexColor.slice(1), 16);
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((value >> 16) & 255) +
    0.7152 * channel((value >> 8) & 255) +
    0.0722 * channel(value & 255)
  );
}

/** Text/icon color on top of the accent: whichever of ink (#16232e) or white
 * has the higher WCAG contrast against it. Until 2026-10-02 this split at
 * luminance 0.5, which put white text on every mid-tone accent (an orange,
 * a coral, WhatsApp green) at about 2:1; the real crossover sits near 0.21.
 * Mirrors `services/resolver/src/render.ts`'s `onAccentColor` and the
 * panel's `prefersInkText` so a designed button reads exactly like a themed
 * one. */
export function onAccentColor(accent: string): string {
  const luminance = relativeLuminance(hex(accent, "#0a6c78"));
  const inkLuminance = 0.0158; // #16232e
  const onInk = (luminance + 0.05) / (inkLuminance + 0.05);
  const onWhite = 1.05 / (luminance + 0.05);
  return onInk > onWhite ? "#16232e" : "#fff";
}

const shadowValues = {
  none: "none",
  soft: "0 1px 2px rgba(22,35,46,.08), 0 8px 24px rgba(22,35,46,.06)",
  strong: "0 4px 10px rgba(22,35,46,.14), 0 16px 40px rgba(22,35,46,.16)",
} as const;

export function shadowCss(
  value: "none" | "soft" | "strong" | undefined,
): string {
  return pick(value, shadowValues, shadowValues.none);
}

const alignValues = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
} as const;
export function alignCss(
  value: "start" | "center" | "end" | undefined,
): string {
  return pick(value, alignValues, alignValues.start);
}
const textAlignValues = {
  start: "left",
  center: "center",
  end: "right",
} as const;
export function textAlignCss(
  value: "start" | "center" | "end" | undefined,
): string {
  return pick(value, textAlignValues, textAlignValues.start);
}

/** Resolves a `ColorToken` (a `#rrggbb` literal or a closed palette token
 * name) to a CSS color value — a hex literal or a `var(--kd-*)` reference,
 * both fixed-shape, never a free string. */
export function colorTokenCss(
  value: string | undefined,
  fallback: string,
): string {
  if (value === undefined) return fallback;
  if (hexPattern.test(value)) return value;
  const tokens: Record<string, string> = {
    text: "var(--kd-text)",
    muted: "var(--kd-muted)",
    accent: "var(--kd-accent)",
    surface: "var(--kd-surface)",
    background: "var(--kd-background)",
  };
  return tokens[value] ?? fallback;
}

/** Background CSS declarations (`background`, plus `background-size`/
 * `background-position` for an image) for a `DesignBackground` — page-level
 * or section-level. `resolveImage` returns `null` to skip an unresolvable
 * image, in which case the background falls back to `fallbackColor`.
 *
 * "Sin banco de fotos" (2026-10-03): an image background with no `imageRef`
 * at all is a deliberate empty slot. With `placeholders` (the panel's own
 * preview only) it paints the same tint `placeholder.ts` uses for a block or
 * item photo slot — pair with `isBackgroundPlaceholder` to also draw its
 * small "Foto de fondo" corner label. Without it (Publisher, Resolver, the
 * public page) it falls back to `fallbackColor`, exactly as before. */
export function backgroundDecl(
  background: DesignBackground | undefined,
  resolveImage: (ref: string) => string | null,
  fallbackColor: string,
  placeholders = false,
): string {
  if (!background || background.kind === "none") return "";
  if (background.kind === "solid") {
    return `background:${hex(background.color, fallbackColor)};`;
  }
  if (background.kind === "gradient") {
    const angle = clampInt(background.angle, 0, 360, 180);
    const from = hex(background.color, fallbackColor);
    const to = hex(background.colorTo, fallbackColor);
    return `background:linear-gradient(${angle}deg, ${from}, ${to});`;
  }
  // "image"
  if (!background.imageRef) {
    // A photo space shows its own color in the Estudio too (with the "Foto
    // de fondo" label), so the text on it reads the same as once published.
    if (placeholders && !background.color)
      return "background:color-mix(in srgb, var(--kd-text) 6%, var(--kd-surface));";
    return `background:${hex(background.color, fallbackColor)};`;
  }
  const resolved = resolveImage(background.imageRef);
  const url = resolved ? safeCssUrl(resolved) : null;
  if (!url) return `background:${hex(background.color, fallbackColor)};`;
  const overlay = clampInt(background.overlay, 0, 80, 0) / 100;
  const position = pick(
    background.position,
    { center: "center", top: "top", bottom: "bottom" },
    "center",
  );
  return (
    `background-image:linear-gradient(rgba(0,0,0,${overlay}),rgba(0,0,0,${overlay})),${url};` +
    `background-size:cover;background-position:${position};background-repeat:no-repeat;`
  );
}

/** Whether `backgroundDecl` painted the "sin banco de fotos" placeholder
 * tint for this background (an image background with no `imageRef`, in the
 * panel's own preview) — callers that draw it then also add its small "Foto
 * de fondo" corner label. */
export function isBackgroundPlaceholder(
  background: DesignBackground | undefined,
  placeholders: boolean,
): boolean {
  return placeholders && background?.kind === "image" && !background.imageRef;
}

/** `font-family` CSS declaration for a validated `DesignFont`. */
export function fontFamilyDecl(font: DesignFont | undefined): string {
  return fontFamilyStack(font ?? "system");
}
