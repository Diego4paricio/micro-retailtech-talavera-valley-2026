import type { CanvasBox } from "./canvas-items.js";

/**
 * Smart guides of the canvas editor, as pure math in design px. A moving
 * box snaps to the canvas edges and center lines, to the edges and centers
 * of the other boxes, and to equal spacing between three boxes in a row or
 * a column. The caller turns its 6 screen px threshold into design px and
 * skips snapping altogether while Alt is held.
 */

/** A line to draw. `x` guides are vertical lines at x = `at`, from y =
 * `from` to `to`; `y` guides are horizontal. */
export type Guide = { axis: "x" | "y"; at: number; from: number; to: number };

/** One of two (or more) equal spaces: from `from` to `to` along `axis`,
 * drawn at `at` on the other axis. */
export type SpacingGap = {
  axis: "x" | "y";
  from: number;
  to: number;
  at: number;
};

export type SnapResult = {
  x: number;
  y: number;
  guides: Guide[];
  gaps: SpacingGap[];
};

/** Extra snap lines a caller can turn on. `margin` adds the page's left and
 * right margin as vertical snap lines (a box's left, center or right edge
 * may snap to them). */
export type SnapOptions = { margin?: number | undefined };

type Axis = "x" | "y";

/** A box seen along one axis: its span and its span on the other axis. */
type Span = {
  start: number;
  end: number;
  crossStart: number;
  crossEnd: number;
};

function span(box: CanvasBox, axis: Axis): Span {
  return axis === "x"
    ? {
        start: box.x,
        end: box.x + box.w,
        crossStart: box.y,
        crossEnd: box.y + box.h,
      }
    : {
        start: box.y,
        end: box.y + box.h,
        crossStart: box.x,
        crossEnd: box.x + box.w,
      };
}

function lines(item: Span): number[] {
  return [item.start, (item.start + item.end) / 2, item.end];
}

const aligned = (a: number, b: number) => Math.abs(a - b) <= 0.5;

/** Middle of where two boxes overlap on the other axis (or between them). */
function crossMiddle(a: Span, b: Span): number {
  const start = Math.max(a.crossStart, b.crossStart);
  const end = Math.min(a.crossEnd, b.crossEnd);
  return (start + end) / 2;
}

type Candidate = {
  delta: number;
  /** Equal spaces to show when this candidate wins, given the final box. */
  gaps?: (
    moving: Span,
  ) => { from: number; to: number; between: [Span, Span] }[];
};

/** The two page-margin lines (left and right) as x positions, or none when
 * there is no room for them. */
function marginPositions(
  canvas: CanvasBox,
  margin: number | undefined,
): number[] {
  if (margin === undefined || margin <= 0 || margin * 2 >= canvas.w) return [];
  return [canvas.x + margin, canvas.x + canvas.w - margin];
}

/** The closest snap along one axis, or `null` when nothing is in reach.
 * `marginLines` are extra standalone x positions (the page margins). */
function bestSnap(
  axis: Axis,
  moving: CanvasBox,
  others: readonly CanvasBox[],
  canvas: CanvasBox,
  threshold: number,
  marginLines: readonly number[] = [],
): Candidate | null {
  const self = span(moving, axis);
  const size = self.end - self.start;
  let best: Candidate | null = null;
  const offer = (candidate: Candidate) => {
    if (Math.abs(candidate.delta) > threshold) return;
    if (!best || Math.abs(candidate.delta) < Math.abs(best.delta))
      best = candidate;
  };

  const targets = [span(canvas, axis), ...others.map((box) => span(box, axis))];
  for (const target of targets)
    for (const line of lines(target))
      for (const offset of [0, size / 2, size])
        offer({ delta: line - (self.start + offset) });
  for (const line of marginLines)
    for (const offset of [0, size / 2, size])
      offer({ delta: line - (self.start + offset) });

  // Equal spacing with the two boxes on either side in the same row (x) or
  // column (y): after the pair, before it, or right between them.
  const row = others
    .map((box) => span(box, axis))
    .filter(
      (item) =>
        item.crossStart < self.crossEnd && self.crossStart < item.crossEnd,
    )
    .sort((a, b) => a.start - b.start);
  for (let index = 0; index + 1 < row.length; index += 1) {
    const a = row[index];
    const b = row[index + 1];
    if (!a || !b || b.start < a.end) continue;
    const gap = b.start - a.end;
    offer({
      delta: b.end + gap - self.start,
      gaps: (m) => [
        { from: a.end, to: b.start, between: [a, b] },
        { from: b.end, to: m.start, between: [b, m] },
      ],
    });
    offer({
      delta: a.start - gap - size - self.start,
      gaps: (m) => [
        { from: m.end, to: a.start, between: [m, a] },
        { from: a.end, to: b.start, between: [a, b] },
      ],
    });
    if (gap >= size)
      offer({
        delta: (a.end + b.start - size) / 2 - self.start,
        gaps: (m) => [
          { from: a.end, to: m.start, between: [a, m] },
          { from: m.end, to: b.start, between: [m, b] },
        ],
      });
  }
  return best;
}

/** Guides the final box lines up with, merged per line. `marginLines` are
 * extra standalone x positions that draw the full canvas height. */
function guidesFor(
  axis: Axis,
  moving: CanvasBox,
  others: readonly CanvasBox[],
  canvas: CanvasBox,
  points: readonly number[],
  marginLines: readonly number[] = [],
): Guide[] {
  const self = span(moving, axis);
  const found = new Map<number, Guide>();
  const add = (at: number, from: number, to: number) => {
    const key = Math.round(at * 2) / 2;
    const guide = found.get(key);
    found.set(
      key,
      guide
        ? {
            ...guide,
            from: Math.min(guide.from, from),
            to: Math.max(guide.to, to),
          }
        : { axis, at: key, from, to },
    );
  };
  const frame = span(canvas, axis);
  for (const line of lines(frame))
    if (points.some((point) => aligned(point, line)))
      add(line, frame.crossStart, frame.crossEnd);
  for (const box of others) {
    const other = span(box, axis);
    for (const line of lines(other))
      if (points.some((point) => aligned(point, line)))
        add(
          line,
          Math.min(other.crossStart, self.crossStart),
          Math.max(other.crossEnd, self.crossEnd),
        );
  }
  for (const line of marginLines)
    if (points.some((point) => aligned(point, line)))
      add(line, frame.crossStart, frame.crossEnd);
  return [...found.values()];
}

/**
 * Snaps a box being dragged. Returns its integer position, the guides it
 * lines up with and, when it snapped to equal spacing, those spaces.
 */
export function snapMove(
  moving: CanvasBox,
  others: readonly CanvasBox[],
  canvas: CanvasBox,
  threshold: number,
  options: SnapOptions = {},
): SnapResult {
  const marginLines = marginPositions(canvas, options.margin);
  const snapX = bestSnap("x", moving, others, canvas, threshold, marginLines);
  const snapY = bestSnap("y", moving, others, canvas, threshold);
  const final: CanvasBox = {
    ...moving,
    x: Math.round(moving.x + (snapX?.delta ?? 0)),
    y: Math.round(moving.y + (snapY?.delta ?? 0)),
  };
  const gaps: SpacingGap[] = [];
  for (const [axis, snap] of [
    ["x", snapX],
    ["y", snapY],
  ] as const) {
    if (!snap?.gaps) continue;
    for (const gap of snap.gaps(span(final, axis)))
      gaps.push({
        axis,
        from: gap.from,
        to: gap.to,
        at: crossMiddle(gap.between[0], gap.between[1]),
      });
  }
  return {
    x: final.x,
    y: final.y,
    guides: [
      ...guidesFor(
        "x",
        final,
        others,
        canvas,
        lines(span(final, "x")),
        marginLines,
      ),
      ...guidesFor("y", final, others, canvas, lines(span(final, "y"))),
    ],
    gaps,
  };
}

/** Which edges a resize handle moves. */
export type ResizeEdges = {
  left?: boolean;
  right?: boolean;
  top?: boolean;
  bottom?: boolean;
};

function nearest(
  value: number,
  targets: readonly number[],
  threshold: number,
): number {
  let best = value;
  let distance = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    const gap = Math.abs(target - value);
    if (gap <= threshold && gap < distance) {
      best = target;
      distance = gap;
    }
  }
  return best;
}

/**
 * Snaps the edges a resize handle moves to the canvas and the other boxes.
 * The opposite edges stay put; sizes never go under `minSize`.
 */
export function snapResize(
  box: CanvasBox,
  edges: ResizeEdges,
  others: readonly CanvasBox[],
  canvas: CanvasBox,
  threshold: number,
  minSize = 8,
  options: SnapOptions = {},
): { box: CanvasBox; guides: Guide[] } {
  const marginLines = marginPositions(canvas, options.margin);
  const targetsX = [
    ...[canvas, ...others].flatMap((item) => lines(span(item, "x"))),
    ...marginLines,
  ];
  const targetsY = [canvas, ...others].flatMap((item) =>
    lines(span(item, "y")),
  );
  let { x, y, w, h } = box;
  if (edges.left) {
    const right = x + w;
    x = Math.round(Math.min(nearest(x, targetsX, threshold), right - minSize));
    w = right - x;
  } else if (edges.right) {
    w = Math.max(minSize, Math.round(nearest(x + w, targetsX, threshold) - x));
  }
  if (edges.top) {
    const bottom = y + h;
    y = Math.round(Math.min(nearest(y, targetsY, threshold), bottom - minSize));
    h = bottom - y;
  } else if (edges.bottom) {
    h = Math.max(minSize, Math.round(nearest(y + h, targetsY, threshold) - y));
  }
  const final = { x, y, w, h };
  const movedX = [edges.left ? x : null, edges.right ? x + w : null].filter(
    (value): value is number => value !== null,
  );
  const movedY = [edges.top ? y : null, edges.bottom ? y + h : null].filter(
    (value): value is number => value !== null,
  );
  return {
    box: final,
    guides: [
      ...guidesFor("x", final, others, canvas, movedX, marginLines),
      ...guidesFor("y", final, others, canvas, movedY),
    ],
  };
}

/** The two vertical page-margin lines (from `canvas.y` to `canvas.y +
 * canvas.h`); none when `margin` leaves no room on the canvas. */
export function marginGuides(canvas: CanvasBox, margin: number): Guide[] {
  return marginPositions(canvas, margin).map((at) => ({
    axis: "x" as const,
    at,
    from: canvas.y,
    to: canvas.y + canvas.h,
  }));
}

/** Snaps one value (a canvas height) to the closest target in reach. */
export function snapValue(
  value: number,
  targets: readonly number[],
  threshold: number,
): number {
  return Math.round(nearest(value, targets, threshold));
}
