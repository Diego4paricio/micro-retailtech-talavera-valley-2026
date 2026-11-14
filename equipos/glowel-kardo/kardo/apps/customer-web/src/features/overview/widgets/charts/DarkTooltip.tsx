import type { ReactNode } from "react";

/**
 * The landing's dark tooltip (`--ink` surface), for the bar charts styled
 * after `AnalyticsPreview` (trend bars, hours, weekday…). Decorative only:
 * every chart repeats the same detail in a polite live region and a hidden
 * table, same as `ChartTooltip` in `features/analytics/charts`.
 */
export function DarkTooltip({
  x,
  y,
  width,
  children,
}: {
  /** Anchor in CSS pixels, relative to the plot frame — the top of the bar. */
  x: number;
  y: number;
  /** Frame width, to keep the tooltip inside it. */
  width: number;
  children: ReactNode;
}) {
  const align = x < 90 ? "start" : x > width - 90 ? "end" : "center";
  return (
    <div
      aria-hidden="true"
      className={`kw-dark-tooltip kw-dark-tooltip-${align}`}
      style={{ left: x, top: y }}
    >
      {children}
    </div>
  );
}

export function DarkTooltipRow({
  label,
  value,
  swatch,
}: {
  label: string;
  value: string;
  swatch?: "nfc" | "qr" | "link" | undefined;
}) {
  return (
    <span className="kw-dark-tooltip-row">
      {swatch ? (
        <span
          aria-hidden="true"
          className={`kw-dark-tooltip-swatch kw-dark-tooltip-swatch-${swatch}`}
        />
      ) : null}
      <strong>{value}</strong>
      <span>{label}</span>
    </span>
  );
}
