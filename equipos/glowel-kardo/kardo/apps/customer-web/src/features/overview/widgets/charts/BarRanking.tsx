import type { ReactNode } from "react";

export type BarRankingRow = {
  id: string;
  /** Clickable when the item links somewhere (a `<Link>`), plain text otherwise. */
  name: ReactNode;
  meta?: string | undefined;
  value: number;
  valueLabel: string;
  shareLabel?: string | undefined;
};

/**
 * Horizontal bars with the name, its value and share — the Resumen's
 * original ranking (`RankingList`), restored as the body of a widget: no
 * panel chrome of its own, and it fills the height it is given.
 */
export function BarRanking({
  rows,
  ariaLabel,
  emptyMessage,
}: {
  rows: readonly BarRankingRow[];
  ariaLabel: string;
  emptyMessage: string;
}) {
  if (rows.length === 0) return <p className="kw-empty">{emptyMessage}</p>;
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ol aria-label={ariaLabel} className="kw-rank-list">
      {rows.map((row) => (
        <li className="kw-rank-row" key={row.id}>
          <div className="kw-rank-head">
            <span className="kw-rank-name">{row.name}</span>
            {row.meta ? <span className="kw-rank-meta">{row.meta}</span> : null}
            <span className="kw-rank-value">
              <strong>{row.valueLabel}</strong>
              {row.shareLabel ? (
                <span className="kw-rank-share">· {row.shareLabel}</span>
              ) : null}
            </span>
          </div>
          <div className="kw-rank-track" role="presentation">
            <div
              className="kw-rank-fill"
              style={{
                width: `${Math.max(2, Math.round((row.value / max) * 100))}%`,
              }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
