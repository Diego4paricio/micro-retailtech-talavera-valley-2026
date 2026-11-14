/**
 * Pure geometry for the channel donut: how big the ring can be and where the
 * legend goes so both always stay inside whatever box the grid measures
 * (`useMeasuredSize`) — the board's minimum widget sizes, the gallery's small
 * preview and the editor's larger one included. No React, no DOM: trivial to
 * unit test on its own (see `test/overview-widgets-layout.test.ts`).
 */

export type DonutLegendPosition = "side" | "below";

export type DonutLayout = {
  /** Ring diameter, in CSS px. Never wider or taller than the measured box. */
  diameter: number;
  /** Beside the ring when there is width to spare, stacked under it otherwise. */
  legendPosition: DonutLegendPosition;
  /** Drops the count column and shrinks the type once room is tight. */
  compactLegend: boolean;
  /** How many legend rows fit; the rest fold into a single "+N" row. */
  visibleLegendItems: number;
};

/** Space reserved between the ring and the legend, on either axis. */
const GAP = 20;
/** Below this the ring stops reading as a donut — prefer stacking instead. */
const MIN_DIAMETER = 64;
/** The Resumen's original donut size (11rem), never exceeded either. */
const MAX_DIAMETER = 176;
/**
 * Minimum legend column width to show the count and stay readable. The
 * swatch, percent and count columns are close to fixed width on their own
 * (~106 px: a 3-digit count is the biggest of it) — this leaves the name
 * column enough of the rest to show "NFC"/"QR" whole, not just an initial.
 */
const SIDE_MIN_WIDTH_FULL = 160;
/** Minimum legend column width once the count is dropped and type shrinks. */
const SIDE_MIN_WIDTH_COMPACT = 96;
const ROW_HEIGHT_FULL = 34;
/** The stacked (original) look needs at least this ring to be worth it. */
const STACKED_MIN_DIAMETER = 96;
/** The side layout must beat the stacked ring by this much to be chosen. */
const SIDE_ADVANTAGE = 16;
const ROW_HEIGHT_COMPACT = 22;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sideLayout(
  width: number,
  height: number,
  itemCount: number,
  legendMinWidth: number,
  rowHeight: number,
  compact: boolean,
): DonutLayout | null {
  // The ring can be at most as tall as the box, and must still leave the
  // legend its minimum column width.
  const diameter = clamp(
    Math.min(height, width - GAP - legendMinWidth),
    MIN_DIAMETER,
    MAX_DIAMETER,
  );
  const widthLeft = width - diameter - GAP;
  if (diameter > height || widthLeft < legendMinWidth) return null;
  const visibleLegendItems = Math.min(
    itemCount,
    Math.floor(height / rowHeight),
  );
  if (visibleLegendItems <= 0) return null;
  return {
    diameter,
    legendPosition: "side",
    compactLegend: compact,
    visibleLegendItems,
  };
}

/** The Resumen's original look: the ring on top of its full legend (with
 * counts), as big as the box allows. */
function stackedLayout(
  width: number,
  height: number,
  itemCount: number,
): DonutLayout | null {
  if (width < SIDE_MIN_WIDTH_FULL) return null;
  const legendHeight = itemCount * ROW_HEIGHT_FULL;
  const diameter = Math.min(width, MAX_DIAMETER, height - GAP - legendHeight);
  if (diameter < STACKED_MIN_DIAMETER) return null;
  return {
    diameter,
    legendPosition: "below",
    compactLegend: false,
    visibleLegendItems: itemCount,
  };
}

/** Last resort: the ring alone must never exceed either measured axis, even
 * under `MIN_DIAMETER` — a legend row only joins if there is room left. */
function belowLayout(
  width: number,
  height: number,
  itemCount: number,
): DonutLayout {
  const diameter = Math.max(0, Math.min(width, height, MAX_DIAMETER));
  const legendHeight = Math.max(0, height - diameter - GAP);
  const visibleLegendItems = Math.min(
    itemCount,
    Math.floor(legendHeight / ROW_HEIGHT_COMPACT),
  );
  return {
    diameter,
    legendPosition: "below",
    compactLegend: true,
    visibleLegendItems: Math.max(0, visibleLegendItems),
  };
}

/**
 * The donut's diameter and legend treatment for a measured `width` ×
 * `height` box holding `itemCount` legend rows. Prefers the original look
 * (ring over its full legend); the legend moves beside the ring when that
 * gives a clearly bigger ring or the stack does not fit; then a compact
 * legend beside it; and only as a last resort a shrunken, stacked ring —
 * always inside the box.
 */
export function donutLayout(
  width: number,
  height: number,
  itemCount: number,
): DonutLayout {
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(height));
  const stacked = stackedLayout(w, h, itemCount);
  const side = sideLayout(
    w,
    h,
    itemCount,
    SIDE_MIN_WIDTH_FULL,
    ROW_HEIGHT_FULL,
    false,
  );
  if (
    stacked &&
    (!side ||
      side.visibleLegendItems < itemCount ||
      stacked.diameter >= side.diameter - SIDE_ADVANTAGE)
  )
    return stacked;
  return (
    side ??
    sideLayout(
      w,
      h,
      itemCount,
      SIDE_MIN_WIDTH_COMPACT,
      ROW_HEIGHT_COMPACT,
      true,
    ) ??
    belowLayout(w, h, itemCount)
  );
}
