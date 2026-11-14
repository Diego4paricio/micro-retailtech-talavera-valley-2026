import type { QrFrameFont } from "@kardo/contracts";

/**
 * Rough, DOM-free glyph metrics used to pick a CTA font size that fits its
 * slot. The renderers still shrink to `maxWidth` at paint time (SVG's
 * `textLength`-free `<text>` scaling is handled by the caller; Canvas uses
 * `fillText`'s built-in `maxWidth`), so these numbers only need to be close
 * enough to avoid visibly oversized or tiny text before that final clamp.
 */
const AVERAGE_ADVANCE: Record<QrFrameFont, number> = {
  sans: 0.56,
  serif: 0.52,
  mono: 0.6,
};

export function estimateTextWidth(
  text: string,
  font: QrFrameFont,
  size: number,
): number {
  return text.length * AVERAGE_ADVANCE[font] * size;
}

/** Largest size in `[min, max]` whose estimated width fits `maxWidth`. */
export function fitFontSize(
  text: string,
  font: QrFrameFont,
  maxWidth: number,
  range: { min: number; max: number },
): number {
  if (!text) return range.max;
  const perCharacter = AVERAGE_ADVANCE[font] * Math.max(1, text.length);
  const bySpace = maxWidth / perCharacter;
  return Math.min(range.max, Math.max(range.min, bySpace));
}
