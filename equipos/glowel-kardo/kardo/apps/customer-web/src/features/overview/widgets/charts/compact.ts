/**
 * Below this measured height, a chart is too short for a normal margin (axis
 * ticks, date labels): it keeps only its marks — a gallery/editor preview
 * (~160 px total, most of it spent on the title, legend and hint text), not
 * a full grid widget.
 */
export const COMPACT_HEIGHT = 90;

export type Margin = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/** A tight margin with just enough left space for a couple of tick labels,
 * or none when there is truly no room to spare. */
export function chartMargin(height: number, full: Margin): Margin {
  if (height >= COMPACT_HEIGHT) return full;
  return { top: 4, right: 4, bottom: 4, left: 4 };
}
