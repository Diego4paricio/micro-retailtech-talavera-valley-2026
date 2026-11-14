import type { PageDesign } from "@kardo/contracts";

// ---------------------------------------------------------------------------
// Readable palette (2026-10-02, AI test bench): the models often pick a light
// gray for `muted` or a pastel accent that do not reach WCAG contrast on the
// page's own cards. Asking for another turn costs tokens and time for a
// fix that is pure arithmetic, so the review loop corrects it here, moving
// the color the least it takes toward black or white (whichever reads on
// that background), and keeps the model's hue. Only the palette's own hex
// colors are touched; nothing else in the design changes.
// ---------------------------------------------------------------------------

const HEX = /^#[0-9a-f]{6}$/i;

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((byte) => {
    const v = byte / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

function mix(hex: string, target: [number, number, number], t: number) {
  const mixed = channels(hex).map((byte, index) =>
    Math.round(byte + ((target[index] ?? 0) - byte) * t),
  );
  return `#${mixed.map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** The color, moved toward black or white (whichever reads better on every
 * background) just enough to reach `ratio` against all of them. */
export function readableOn(
  color: string,
  backgrounds: readonly string[],
  ratio: number,
): string {
  const surfaces = backgrounds.filter((value) => HEX.test(value));
  if (!HEX.test(color) || surfaces.length === 0) return color;
  const reads = (candidate: string) =>
    surfaces.every((surface) => contrastRatio(candidate, surface) >= ratio);
  if (reads(color)) return color;
  const darkest = Math.min(...surfaces.map(luminance));
  const target: [number, number, number] =
    darkest > 0.18 ? [0, 0, 0] : [255, 255, 255];
  for (let step = 1; step <= 20; step += 1) {
    const candidate = mix(color, target, step / 20);
    if (reads(candidate)) return candidate;
  }
  return mix(color, target, 1);
}

export type PaletteFix = { token: string; from: string; to: string };

/** Whether the accent writes normal-size text somewhere: prices in the
 * accent, a block or a text run colored "accent", or soft/outline buttons
 * (accent letters on a tint or on the page). Then it is text and needs 4.5:1
 * (relevo 37, IA3: a pink or gold of ~4.1:1 on white went through). */
export function accentWritesText(design: PageDesign): boolean {
  const { buttonStyle } = design.style;
  if (buttonStyle === "soft" || buttonStyle === "outline") return true;
  const walk = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(walk);
    if (typeof value !== "object" || value === null) return false;
    for (const [key, child] of Object.entries(value)) {
      if (key === "background") continue;
      if ((key === "priceStyle" || key === "color") && child === "accent")
        return true;
      if (walk(child)) return true;
    }
    return false;
  };
  return walk(design.sections);
}

/**
 * Text and muted reach 4.5:1 on the background and on the cards; the
 * accent reaches 3:1 on the cards (enough for a button to stand out; the
 * button's own label color is picked by the renderer), or 4.5:1 on both when
 * it also writes text (`accentWritesText`). Returns the design (unchanged
 * when nothing needed it) and what changed, for the audit.
 *
 * This lives in the AI's review loop, not in `checkDesign`: checkDesign also
 * validates the owner's own designs when saving, and a hard rule there would
 * stop someone from saving their pastel accent.
 */
export function ensureReadablePalette(design: PageDesign): {
  design: PageDesign;
  fixes: PaletteFix[];
} {
  const palette = design.style.palette;
  const grounds = [palette.background, palette.surface];
  const next = {
    ...palette,
    text: readableOn(palette.text, grounds, 4.5),
    muted: readableOn(palette.muted, grounds, 4.5),
    accent: accentWritesText(design)
      ? readableOn(palette.accent, grounds, 4.5)
      : readableOn(palette.accent, [palette.surface], 3),
  };
  const fixes = (["text", "muted", "accent"] as const)
    .filter((token) => next[token] !== palette[token])
    .map((token) => ({ token, from: palette[token], to: next[token] }));
  if (fixes.length === 0) return { design, fixes };
  return {
    design: { ...design, style: { ...design.style, palette: next } },
    fixes,
  };
}
