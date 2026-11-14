/**
 * Color arithmetic for the first-impression templates: every palette is
 * built from one accent (the brand's color or the one picked in «Cómo se
 * ve»), so each tone is a mix of it and every text tone is checked against
 * its background (WCAG contrast, the design guide's 4.5:1 and 3:1).
 */

import { contrastRatio, relativeLuminance } from "../../../../lib/color.js";

type Rgb = [number, number, number];

const isHex = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

function rgb(hex: string): Rgb {
  const value = isHex(hex) ? hex.slice(1) : "000000";
  return [0, 2, 4].map((start) =>
    Number.parseInt(value.slice(start, start + 2), 16),
  ) as Rgb;
}

function toHex(channels: Rgb): string {
  return `#${channels
    .map((channel) =>
      Math.round(Math.min(255, Math.max(0, channel)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** `a` with `amount` (0 to 1) of `b`. */
export function mix(a: string, b: string, amount: number): string {
  const from = rgb(a);
  const to = rgb(b);
  return toHex(
    from.map(
      (channel, index) => channel + ((to[index] ?? channel) - channel) * amount,
    ) as Rgb,
  );
}

export const luminance = relativeLuminance;
export const contrast = contrastRatio;

/** `color` moved toward black or white, in small steps, until it reads
 * `ratio` against `background`. */
export function readable(
  color: string,
  background: string,
  ratio: number,
): string {
  if (contrast(color, background) >= ratio) return color;
  const toward = luminance(background) > 0.35 ? "#000000" : "#ffffff";
  for (let step = 1; step <= 20; step++) {
    const next = mix(color, toward, step / 20);
    if (contrast(next, background) >= ratio) return next;
  }
  return toward;
}

/** White or near black, whichever reads best on `background`. */
export function inkOn(background: string): string {
  return contrast("#ffffff", background) >= contrast("#16120f", background)
    ? "#ffffff"
    : "#16120f";
}

/** A valid accent: the given hex, or the fallback. */
export function accentOr(value: string | undefined, fallback: string): string {
  return value && isHex(value) ? value.toLowerCase() : fallback;
}
