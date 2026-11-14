import { formatNumber, formatPercent } from "../../../lib/format.js";
import type { WidgetRenderProps } from "../dashboard/types.js";
import {
  channelColorVar,
  channelLabels,
  channelOrder,
  channelTotal,
  topChannels,
} from "./charts/aggregate.js";
import { BarRanking, type BarRankingRow } from "./charts/BarRanking.js";
import { Donut } from "./charts/Donut.js";
import { donutLayout } from "./charts/donut-layout.js";
import { useMeasuredSize } from "./charts/use-measured-size.js";

function resolveChart(value: unknown): "donut" | "bars" {
  return value === "bars" ? "bars" : "donut";
}

/** How people reach a Touchpoint: NFC, QR or a direct URL — the Resumen's
 * original channel donut (`ChannelSplitChart`), or the same shares as bars. */
export function ChannelsWidget({ widget, context }: WidgetRenderProps) {
  const chart = resolveChart(widget.config.chart);
  const { channels } = context.data.totals;
  const total = channelTotal(channels);

  if (!context.engineAvailable)
    return (
      <p className="kw-empty">Disponible cuando vuelva la analítica en vivo.</p>
    );
  if (total === 0)
    return (
      <p className="kw-empty">
        Cuando alguien acerque su celular o escanee un código, verás aquí por
        qué canal llega.
      </p>
    );

  const ariaLabel = `Reparto por canal: ${channelOrder
    .map(
      (key) => `${channelLabels[key]} ${formatPercent(channels[key], total)}`,
    )
    .join(", ")}.`;

  if (chart === "bars") {
    const rows: BarRankingRow[] = channelOrder
      .filter((key) => channels[key] > 0)
      .map((key) => ({
        id: key,
        name: channelLabels[key],
        value: channels[key],
        valueLabel: formatNumber(channels[key]),
        shareLabel: formatPercent(channels[key], total),
      }));
    return (
      <BarRanking
        ariaLabel={ariaLabel}
        emptyMessage="Sin accesos todavía."
        rows={rows}
      />
    );
  }

  return <DonutBody ariaLabel={ariaLabel} channels={channels} total={total} />;
}

/**
 * The ring plus its legend, sized from the box the grid actually gives this
 * widget (`useMeasuredSize`) so neither ever spills past the frame — down to
 * the catalog's smallest size (3×4) and the gallery/editor's own preview
 * box. See `donut-layout.ts` for the placement rules.
 */
function DonutBody({
  channels,
  total,
  ariaLabel,
}: {
  channels: Record<"nfc" | "qr" | "link", number>;
  total: number;
  ariaLabel: string;
}) {
  const [frameRef, width, height] = useMeasuredSize(220, 160);
  const layout = donutLayout(width, height, channelOrder.length);
  // `visibleLegendItems` is how many *rows* fit. When that is not every
  // channel, one of those rows becomes the "+N más" line instead of an item.
  const capacity = layout.visibleLegendItems;
  const clipped = capacity < channelOrder.length;
  const itemRows = clipped ? Math.max(0, capacity - 1) : capacity;
  const shown = topChannels(channels, itemRows);
  const hidden = channelOrder.length - shown.length;

  return (
    <div
      className="kw-channels"
      data-legend={layout.legendPosition}
      data-legend-compact={layout.compactLegend || undefined}
      ref={frameRef}
    >
      <Donut
        ariaLabel={ariaLabel}
        centerCaption="accesos"
        centerValue={formatNumber(total)}
        segments={channelOrder.map((key) => ({
          key,
          value: channels[key],
          color: channelColorVar[key],
        }))}
        size={layout.diameter}
      />
      {capacity > 0 ? (
        <ul className="kw-donut-legend">
          {shown.map((key) => (
            <li key={key}>
              <span
                aria-hidden="true"
                className={`chart-legend-swatch chart-legend-${key}`}
              />
              <span className="kw-donut-legend-label">
                {channelLabels[key]}
              </span>
              <strong>{formatPercent(channels[key], total)}</strong>
              {layout.compactLegend ? null : (
                <span className="kw-donut-legend-value">
                  {formatNumber(channels[key])}
                </span>
              )}
            </li>
          ))}
          {hidden > 0 ? (
            <li className="kw-donut-legend-more">+{hidden} más</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
