import type { CSSProperties } from "react";

export type DonutSegment = {
  key: string;
  value: number;
  /** A CSS color value (a token, e.g. `var(--teal)`), never a literal hex. */
  color: string;
};

const radius = 54;
const strokeWidth = 16;
const circumference = 2 * Math.PI * radius;
const size = (radius + strokeWidth) * 2;
const center = size / 2;
/** A surface-colored gap between segments, in stroke length. */
const gap = 2.5;

/**
 * The Resumen's original channel donut (`ChannelSplitChart`, restored):
 * a ring per segment with a surface gap, the total centered in the display
 * font. Without `size` it scales via `width: 100%` in CSS (no JS
 * measurement); callers that must never overflow their frame (the widget
 * grid) measure their box and pass an exact pixel `size` instead — see
 * `donut-layout.ts`.
 */
export function Donut({
  segments,
  centerValue,
  centerCaption,
  ariaLabel,
  size: renderSize,
}: {
  segments: readonly DonutSegment[];
  centerValue: string;
  centerCaption: string;
  ariaLabel: string;
  /** Rendered diameter in CSS px; omit to let CSS scale it (`width: 100%`). */
  size?: number | undefined;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const visible = segments.filter((segment) => segment.value > 0);
  let offset = 0;

  return (
    <svg
      aria-label={ariaLabel}
      className="kw-donut"
      height={size}
      role="img"
      style={
        renderSize !== undefined
          ? { height: renderSize, width: renderSize }
          : undefined
      }
      viewBox={`0 0 ${size} ${size}`}
      width={size}
    >
      <circle
        cx={center}
        cy={center}
        fill="none"
        r={radius}
        stroke="var(--line)"
        strokeWidth={strokeWidth}
      />
      {visible.map((segment) => {
        const length = total > 0 ? (segment.value / total) * circumference : 0;
        const dash = visible.length > 1 ? Math.max(0, length - gap) : length;
        const style = { "--kw-circ": `${circumference}` } as CSSProperties;
        const element = (
          <circle
            className="kw-donut-segment"
            cx={center}
            cy={center}
            fill="none"
            key={segment.key}
            r={radius}
            stroke={segment.color}
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
            strokeWidth={strokeWidth}
            style={style}
            transform={`rotate(-90 ${center} ${center})`}
          />
        );
        offset += length;
        return element;
      })}
      <text
        className="kw-donut-total"
        dy="0.1em"
        textAnchor="middle"
        x={center}
        y={center}
      >
        {centerValue}
      </text>
      <text
        className="kw-donut-caption"
        dy="1.9em"
        textAnchor="middle"
        x={center}
        y={center}
      >
        {centerCaption}
      </text>
    </svg>
  );
}
