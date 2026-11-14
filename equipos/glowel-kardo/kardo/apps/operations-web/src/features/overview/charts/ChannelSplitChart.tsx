import { formatNumber, formatPercent } from "../../../lib/format.js";

type Channels = { nfc: number; qr: number; link: number };

const radius = 52;
const strokeWidth = 22;
const circumference = 2 * Math.PI * radius;
const size = (radius + strokeWidth) * 2;
const center = size / 2;

const channelLabels: Record<keyof Channels, string> = {
  nfc: "NFC",
  qr: "QR",
  link: "URL directa",
};
const channelColors: Record<keyof Channels, string> = {
  nfc: "var(--teal)",
  qr: "var(--aqua)",
  link: "var(--ink)",
};

export function ChannelSplitChart({ channels }: { channels: Channels }) {
  const total = channels.nfc + channels.qr + channels.link;
  const order: (keyof Channels)[] = ["nfc", "qr", "link"];

  return (
    <section
      aria-labelledby="channel-split-heading"
      className="panel chart-panel"
    >
      <h3 className="kd-ranking-title" id="channel-split-heading">
        Reparto por canal
      </h3>
      {total > 0 ? (
        <div className="kd-donut-wrap">
          <svg
            aria-label={`Reparto de taps por canal: ${order
              .map(
                (key) =>
                  `${channelLabels[key]} ${formatPercent(channels[key], total)}`,
              )
              .join(", ")}.`}
            height={size}
            role="img"
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
            {(() => {
              let offset = 0;
              return order.map((key) => {
                const value = channels[key];
                if (value <= 0) return null;
                const dash = (value / total) * circumference;
                const circle = (
                  <circle
                    cx={center}
                    cy={center}
                    fill="none"
                    key={key}
                    r={radius}
                    stroke={channelColors[key]}
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={-offset}
                    strokeWidth={strokeWidth}
                    transform={`rotate(-90 ${center} ${center})`}
                  />
                );
                offset += dash;
                return circle;
              });
            })()}
            <text
              dy="-0.1em"
              fill="var(--text)"
              fontSize={20}
              fontWeight={700}
              textAnchor="middle"
              x={center}
              y={center}
            >
              {formatNumber(total)}
            </text>
            <text
              dy="1.3em"
              fill="var(--text-soft)"
              fontSize={11}
              textAnchor="middle"
              x={center}
              y={center}
            >
              taps
            </text>
          </svg>
          <ul className="chart-legend kd-donut-legend">
            {order.map((key) => (
              <li key={key}>
                <span
                  aria-hidden="true"
                  className={`chart-legend-swatch chart-legend-${key === "nfc" ? "a" : key === "qr" ? "b" : "c"}`}
                />
                {channelLabels[key]} · {formatNumber(channels[key])} (
                {formatPercent(channels[key], total)})
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="muted">Sin taps en este periodo.</p>
      )}
    </section>
  );
}
