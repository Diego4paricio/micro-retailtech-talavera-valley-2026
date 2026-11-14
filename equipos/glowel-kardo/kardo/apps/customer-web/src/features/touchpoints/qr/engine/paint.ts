import type { QrPaint } from "@kardo/contracts";
import type { ScenePaint } from "./types.js";

/**
 * Resolves a stored `QrPaint` into absolute scene coordinates over the
 * symbol's bounding square (`userSpaceOnUse` gradients, never the padded
 * scene). `angle` is degrees, clockwise from "left → right" (0) to
 * "top → bottom" (90), matching `QrPaintSchema`.
 */
export function resolvePaint(
  paint: QrPaint,
  symbol: { x: number; y: number; size: number },
): ScenePaint {
  if (paint.kind === "solid") return { kind: "solid", color: paint.color };

  const cx = symbol.x + symbol.size / 2;
  const cy = symbol.y + symbol.size / 2;

  if (paint.kind === "radial") {
    // Circumscribes the square so every corner still reaches the end color.
    const r = (symbol.size * Math.SQRT2) / 2;
    return { kind: "radial", from: paint.from, to: paint.to, cx, cy, r };
  }

  const theta = (paint.angle * Math.PI) / 180;
  const dx = Math.cos(theta);
  const dy = Math.sin(theta);
  const half = symbol.size / 2;
  // Projects the square's half-extent onto the gradient axis so the line
  // always spans the full symbol, whatever the angle.
  const length = half * (Math.abs(dx) + Math.abs(dy)) || half;
  return {
    kind: "linear",
    from: paint.from,
    to: paint.to,
    x1: cx - dx * length,
    y1: cy - dy * length,
    x2: cx + dx * length,
    y2: cy + dy * length,
  };
}

/** One representative color for contrast checks and eye-color inheritance. */
export function paintRepresentativeColor(paint: QrPaint): string {
  return paint.kind === "solid" ? paint.color : paint.from;
}

/** Every distinct color a paint can show (checked individually for contrast). */
export function paintColorStops(paint: QrPaint): readonly string[] {
  return paint.kind === "solid" ? [paint.color] : [paint.from, paint.to];
}
