import { useId } from "react";
import { monotonePath } from "./chart-utils.js";

/**
 * 80 × 24 trend without axes, ending in a dot (research §5). Decorative: the
 * KPI next to it already states the number and its change.
 */
export function Sparkline({
  values,
  width = 80,
  height = 24,
  tone = "teal",
}: {
  values: number[];
  width?: number | undefined;
  height?: number | undefined;
  tone?: "teal" | "aqua" | "ink" | undefined;
}) {
  const id = useId();
  if (values.length < 2) return null;
  const pad = 3;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = (width - pad * 2) / (values.length - 1);
  const points = values.map((value, index) => ({
    x: pad + index * step,
    y:
      max === min
        ? height / 2
        : pad + (1 - (value - min) / range) * (height - pad * 2),
  }));
  const line = monotonePath(points);
  const last = points[points.length - 1];
  const first = points[0];
  const area =
    last && first ? `${line} L${last.x},${height} L${first.x},${height} Z` : "";

  return (
    <svg
      aria-hidden="true"
      className={`sparkline sparkline-${tone}`}
      focusable="false"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
    >
      <defs>
        <linearGradient id={`${id}-wash`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.16} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path className="sparkline-area" d={area} fill={`url(#${id}-wash)`} />
      <path className="sparkline-line" d={line} pathLength={1} />
      {last ? (
        <circle className="sparkline-dot" cx={last.x} cy={last.y} r={2.75} />
      ) : null}
    </svg>
  );
}
