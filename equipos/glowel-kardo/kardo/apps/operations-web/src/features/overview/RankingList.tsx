import type { ReactNode } from "react";
import { formatNumber } from "../../lib/format.js";

export type RankingItem = {
  id: string;
  name: string;
  value: number;
  /** Optional clickable version of the name (e.g. a <Link> to the customer detail). */
  link?: ReactNode;
};

export function RankingList({
  title,
  items,
  emptyLabel,
  valueSuffix = "taps",
}: {
  title: string;
  items: RankingItem[];
  emptyLabel: string;
  valueSuffix?: string;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <section aria-label={title} className="panel kd-ranking">
      <h3 className="kd-ranking-title">{title}</h3>
      {items.length ? (
        <ul className="kd-ranking-list">
          {items.map((item) => (
            <li key={item.id}>
              <div className="kd-ranking-row">
                <span className="kd-ranking-name">
                  {item.link ?? item.name}
                </span>
                <span className="kd-ranking-value">
                  {formatNumber(item.value)} {valueSuffix}
                </span>
              </div>
              <div className="kd-ranking-track" role="presentation">
                <div
                  className="kd-ranking-fill"
                  style={{ width: `${Math.round((item.value / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{emptyLabel}</p>
      )}
    </section>
  );
}
