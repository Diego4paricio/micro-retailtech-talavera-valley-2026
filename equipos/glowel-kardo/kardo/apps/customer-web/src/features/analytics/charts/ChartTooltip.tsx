import type { ReactNode } from "react";

/**
 * Floating readout anchored to a data position inside `.chart-plot`. It is
 * decorative for assistive tech: each chart announces the same detail in a
 * polite live region and offers a full table.
 */
export function ChartTooltip({
  x,
  y,
  width,
  side,
  children,
}: {
  /** Anchor in CSS pixels, relative to the plot frame. */
  x: number;
  y: number;
  /** Frame width, to keep the tooltip inside it. */
  width: number;
  /** Beside the anchor instead of above it (for clipped, scrolling plots). */
  side?: boolean | undefined;
  children: ReactNode;
}) {
  let className: string;
  if (side) {
    className = `chart-tooltip chart-tooltip-side-${x > width - 200 ? "left" : "right"}`;
  } else {
    const align = x < 120 ? "start" : x > width - 120 ? "end" : "center";
    const placement = y < 96 ? "below" : "above";
    className = `chart-tooltip chart-tooltip-${align} chart-tooltip-${placement}`;
  }
  return (
    <div aria-hidden="true" className={className} style={{ left: x, top: y }}>
      {children}
    </div>
  );
}

/** A tooltip row: line key · value (strong) · label. */
export function TooltipRow({
  swatch,
  value,
  label,
}: {
  swatch: "line" | "dashed" | "nfc" | "qr" | "link";
  value: string;
  label: string;
}) {
  return (
    <span className="chart-tooltip-row">
      <span aria-hidden="true" className={`chart-key chart-key-${swatch}`} />
      <strong>{value}</strong>
      <span>{label}</span>
    </span>
  );
}
