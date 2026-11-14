import { niceMax } from "../../../lib/chart-scale.js";
import { formatNumber } from "../../../lib/format.js";

export type BarItem = {
  id: string;
  label: string;
  value: number;
  /** When set, draws an inner (darker) bar showing `secondary` out of `value`. */
  secondary?: number;
  secondaryLabel?: string;
};

/**
 * A horizontal bar list: an accessible alternative to a canvas bar chart,
 * reused for touchpoint status distribution, experience types (total vs.
 * live) and plan distribution.
 */
export function BarList({
  title,
  items,
  emptyLabel,
  valueSuffix,
  id,
}: {
  title: string;
  items: BarItem[];
  emptyLabel: string;
  valueSuffix?: string;
  id?: string;
}) {
  const max = niceMax(items.map((item) => item.value));
  const headingId = id ?? title;
  return (
    <section aria-labelledby={headingId} className="panel kd-ranking">
      <h3 className="kd-ranking-title" id={headingId}>
        {title}
      </h3>
      {items.length ? (
        <ul className="kd-ranking-list">
          {items.map((item) => {
            const widthPercent = Math.round((item.value / max) * 100);
            const innerPercent =
              item.secondary !== undefined && item.value > 0
                ? Math.round((item.secondary / item.value) * 100)
                : null;
            return (
              <li key={item.id}>
                <div className="kd-ranking-row">
                  <span className="kd-ranking-name">{item.label}</span>
                  <span className="kd-ranking-value">
                    {formatNumber(item.value)}
                    {valueSuffix ? ` ${valueSuffix}` : ""}
                    {innerPercent !== null ? (
                      <>
                        {" · "}
                        {formatNumber(item.secondary ?? 0)}{" "}
                        {item.secondaryLabel ?? "en vivo"}
                      </>
                    ) : null}
                  </span>
                </div>
                <div
                  className="kd-ranking-track"
                  role="presentation"
                  style={{ width: `${widthPercent}%` }}
                >
                  {innerPercent !== null ? (
                    <div
                      className="kd-ranking-fill-inner"
                      style={{ width: `${innerPercent}%` }}
                    />
                  ) : (
                    <div
                      className="kd-ranking-fill"
                      style={{ width: "100%" }}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">{emptyLabel}</p>
      )}
    </section>
  );
}
