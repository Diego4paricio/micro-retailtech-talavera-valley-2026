/**
 * Pure scale/layout helpers shared by the hand-made SVG charts. Extracted so
 * the arithmetic (never the rendering) is unit tested.
 */

/** At least 1, so a chart with all-zero data still has a usable scale. */
export function niceMax(values: readonly number[]): number {
  return Math.max(1, ...values);
}

/** Maps a data value to a pixel length within `size`, clamped to `[0, size]`. */
export function scaleValue(value: number, max: number, size: number): number {
  if (max <= 0) return 0;
  const scaled = (value / max) * size;
  return Math.min(size, Math.max(0, scaled));
}

/** Evenly spaced tick values from 0 to `max`, `count + 1` points. */
export function tickValues(max: number, count: number): number[] {
  const steps = Math.max(1, count);
  return Array.from({ length: steps + 1 }, (_, index) =>
    Math.round((max / steps) * index),
  );
}

/** Width (in px) of a single slot when `count` items share `totalWidth`. */
export function slotWidth(count: number, totalWidth: number): number {
  return count > 0 ? totalWidth / count : 0;
}

/** Bar width within a slot, bounded to keep bars readable at any density. */
export function barWidthFor(
  slot: number,
  ratio = 0.62,
  min = 3,
  max = 36,
): number {
  return Math.max(min, Math.min(slot * ratio, max));
}
