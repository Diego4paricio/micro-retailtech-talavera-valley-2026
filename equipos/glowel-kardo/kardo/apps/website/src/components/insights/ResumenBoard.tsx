"use client";

import { type PointerEvent, type ReactNode, useId, useState } from "react";
import { useDemoBusiness } from "@/lib/demo-business";
import {
  count,
  delta,
  type ResumenSample,
  samples,
  weekdayNames,
  weekdays,
} from "./sample";

/*
  A replica of the panel's Resumen board (apps/customer-web overview): the
  default widgets, the panel's tokens (surface #fffdf8, line #e2ded4, teal
  ramp, dark tooltip) and example data. Hover works like in the panel. The
  data follows the business chosen in the live demo (lib/demo-business.ts);
  the server render shows the café.
*/

const ramp = ["#74b9c0", "#3f9ca6", "#1b8490", "#0a6c78", "#064d56"];
const percent = (value: number, digits = 1) =>
  `${new Intl.NumberFormat("es-MX", { maximumFractionDigits: digits }).format(value)} %`;

/** Smooth line through points (Catmull-Rom as cubic Béziers). */
function smooth(points: [number, number][]): string {
  if (points.length === 0) return "";
  let path = `M${points[0]?.[0]} ${points[0]?.[1]}`;
  for (let index = 0; index < points.length - 1; index++) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;
    if (!p0 || !p1 || !p2 || !p3) continue;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    path += ` C${c1x} ${c1y} ${c2x} ${c2y} ${p2[0]} ${p2[1]}`;
  }
  return path;
}

export function ResumenBoard() {
  const business = useDemoBusiness();
  // A new business starts the board over, hover state included.
  return <Board key={business} sample={samples[business]} />;
}

function Board({ sample }: { sample: ResumenSample }) {
  const { taps, previousTaps, clicks, previousClicks, leads, previousLeads } =
    sample;
  const conversion = (leads / taps) * 100;
  const previousConversion = (previousLeads / previousTaps) * 100;
  const last14 = sample.daily.slice(-14);
  return (
    <div className="rounded-[1.6rem] bg-[#f7f5f0] p-4 text-ink shadow-[0_40px_90px_-40px_rgba(0,0,0,0.7)] ring-1 ring-white/10 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-[1.9rem] leading-none font-semibold tracking-[-0.04em] sm:text-[2.2rem]">
            Resumen
          </p>
          <p className="mt-2 text-[14px] text-[#52646d]">
            Así se mueven tus QR y etiquetas en {sample.business}.
          </p>
        </div>
        <div aria-hidden="true" className="flex flex-wrap items-center gap-2">
          <span className="flex rounded-full bg-[#fffdf8] p-1 text-[13px] font-semibold ring-1 ring-[#e2ded4]">
            <span className="rounded-full px-3 py-1.5 text-[#52646d]">
              7 días
            </span>
            <span className="rounded-full bg-[#16232e] px-3 py-1.5 text-[#f7f5f0]">
              30 días
            </span>
            <span className="rounded-full px-3 py-1.5 text-[#52646d]">
              90 días
            </span>
          </span>
          <span className="rounded-full bg-[#fffdf8] px-3 py-2 text-[12px] font-medium text-[#52646d] ring-1 ring-[#e2ded4]">
            Últimos 30 días vs. 30 días previos
          </span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-12">
        <Kpi
          label="Accesos"
          previous={previousTaps}
          series={last14}
          value={taps}
        />
        <Kpi
          label="Clics en acciones"
          previous={previousClicks}
          series={sample.clickSeries}
          value={clicks}
        />
        <Kpi
          label="Solicitudes"
          previous={previousLeads}
          series={sample.leadSeries}
          value={leads}
        />
        <Kpi
          format={(value) => percent(value)}
          label="Tasa de conversión"
          previous={previousConversion}
          series={sample.conversionSeries}
          value={conversion}
        />
        <Widget className="col-span-2 lg:col-span-8" title="Accesos por día">
          <TrendChart sample={sample} />
        </Widget>
        <Widget className="col-span-2 lg:col-span-4" title="Reparto por canal">
          <Donut sample={sample} />
        </Widget>
        <Widget
          className="col-span-2 lg:col-span-12"
          title="Actividad por día y hora"
        >
          <Heatmap sample={sample} />
        </Widget>
        <Widget
          className="col-span-2 lg:col-span-6"
          title="QR y etiquetas con más accesos"
        >
          <Ranking sample={sample} />
        </Widget>
        <Widget
          className="col-span-2 lg:col-span-6"
          title="Embudo de conversión"
        >
          <Funnel sample={sample} />
        </Widget>
      </div>
    </div>
  );
}

function Widget({
  title,
  className,
  children,
}: {
  title: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={`min-w-0 rounded-[0.75rem] border border-[#e2ded4] bg-[#fffdf8] px-[1.15rem] pt-[0.95rem] pb-[1.1rem] shadow-[0_1px_2px_rgba(22,35,46,0.05)] ${className}`}
    >
      <h4 className="truncate font-display text-[1.15rem] font-semibold tracking-[-0.015em] text-[#16232e]">
        {title}
      </h4>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Kpi({
  label,
  value,
  previous,
  series,
  format = count,
}: {
  label: string;
  value: number;
  previous: number;
  series: number[];
  format?: (value: number) => string;
}) {
  const change = delta(value, previous);
  const tones = {
    up: "bg-[#e6f2ec] text-[#1e6b50]",
    down: "bg-[#f9e9e7] text-[#9b3530]",
    flat: "bg-[#f7f5f0] text-[#52646d] ring-1 ring-inset ring-[#d9ded8]",
  };
  return (
    <article className="flex min-h-[8.5rem] min-w-0 flex-col rounded-[0.75rem] border border-[#e2ded4] bg-[#fffdf8] px-[1.1rem] pt-4 pb-3.5 shadow-[0_1px_2px_rgba(22,35,46,0.05)] lg:col-span-3">
      <p className="truncate text-[0.75rem] font-semibold tracking-[0.01em] text-[#52646d]">
        {label}
      </p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <strong className="font-display text-[1.6rem] leading-none font-semibold tracking-[-0.025em] sm:text-[2rem]">
          {format(value)}
        </strong>
        <Sparkline values={series} />
      </div>
      {/* Like the panel: with nothing to compare against, no trend. */}
      {change ? (
        <p className="mt-auto flex flex-wrap items-center gap-1.5 pt-3 text-[0.6875rem] text-[#66777f]">
          <span
            className={`rounded-full px-2 py-0.5 font-semibold ${tones[change.direction]}`}
          >
            {change.text}
          </span>
          vs. 30 días previos
        </p>
      ) : null}
    </article>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const id = useId();
  const width = 80;
  const height = 24;
  const pad = 3;
  const max = Math.max(...values);
  const min = Math.min(...values);
  // A flat series (no leads, say) runs through the middle, as in the panel.
  const points = values.map(
    (value, index) =>
      [
        pad + (index / (values.length - 1)) * (width - pad * 2),
        max === min
          ? height / 2
          : pad + (1 - (value - min) / (max - min)) * (height - pad * 2),
      ] as [number, number],
  );
  const line = smooth(points);
  const last = points.at(-1) ?? [0, 0];
  return (
    <svg
      aria-hidden="true"
      className="hidden h-6 w-20 shrink-0 text-[#0a6c78] sm:block"
      viewBox={`0 0 ${width} ${height}`}
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.16" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${line} L${last[0]} ${height} L${pad} ${height} Z`}
        fill={`url(#${id})`}
      />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
      <circle
        cx={last[0]}
        cy={last[1]}
        fill="currentColor"
        r="2.75"
        stroke="#fffdf8"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function TrendChart({ sample }: { sample: ResumenSample }) {
  const { daily, previousDaily } = sample;
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const width = 640;
  const height = 250;
  // Axes carry a title, like every chart in the panel (owner, 2026-09-28).
  const margin = { top: 16, right: 14, bottom: 46, left: 58 };
  const max = sample.yMax;
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const x = (index: number) =>
    margin.left + (index / (daily.length - 1)) * innerWidth;
  const y = (value: number) => margin.top + (1 - value / max) * innerHeight;
  const line = smooth(daily.map((value, index) => [x(index), y(value)]));
  const previousLine = smooth(
    previousDaily.map((value, index) => [x(index), y(value)]),
  );
  const lastIndex = daily.length - 1;
  const ticks = [0, max / 2, max];
  const labels = [
    { index: 0, text: "hace 30 días" },
    { index: 14, text: "hace 15 días" },
    { index: lastIndex, text: "hoy" },
  ];

  function onMove(event: PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - box.left) / box.width) * width;
    const index = Math.round(((svgX - margin.left) / innerWidth) * lastIndex);
    setActive(Math.max(0, Math.min(lastIndex, index)));
  }

  const activeValue = active === null ? null : daily[active];
  const activePrevious = active === null ? null : previousDaily[active];
  return (
    <div className="relative">
      <svg
        aria-label={`Accesos por día en los últimos 30 días, de ${daily[0]} a ${daily[lastIndex]} por día, con el periodo anterior como línea punteada.`}
        className="h-auto w-full touch-pan-y"
        onPointerLeave={() => setActive(null)}
        onPointerMove={onMove}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#0a6c78" stopOpacity="0.18" />
            <stop offset="1" stopColor="#0a6c78" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              stroke={tick === 0 ? "#cbd6d4" : "#e4dfd3"}
              x1={margin.left}
              x2={width - margin.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text
              className="fill-[#66777f] text-[11px] tabular-nums"
              textAnchor="end"
              x={margin.left - 8}
              y={y(tick) + 4}
            >
              {tick}
            </text>
          </g>
        ))}
        {labels.map((label) => (
          <text
            className="fill-[#66777f] text-[11px]"
            key={label.text}
            textAnchor={
              label.index === 0
                ? "start"
                : label.index === lastIndex
                  ? "end"
                  : "middle"
            }
            x={x(label.index)}
            y={height - 26}
          >
            {label.text}
          </text>
        ))}
        <text
          className="fill-[#52646d] text-[11px] font-semibold"
          textAnchor="middle"
          x={margin.left + innerWidth / 2}
          y={height - 6}
        >
          Día
        </text>
        <text
          className="fill-[#52646d] text-[11px] font-semibold"
          textAnchor="middle"
          transform={`rotate(-90 14 ${margin.top + innerHeight / 2})`}
          x={14}
          y={margin.top + innerHeight / 2}
        >
          Accesos
        </text>
        <path
          d={`${line} L${x(lastIndex)} ${y(0)} L${x(0)} ${y(0)} Z`}
          fill={`url(#${id})`}
        />
        <path
          d={previousLine}
          fill="none"
          stroke="#82928f"
          strokeDasharray="5 5"
          strokeWidth="1.5"
        />
        <path
          d={line}
          fill="none"
          stroke="#0a6c78"
          strokeLinecap="round"
          strokeWidth="2"
        />
        <circle
          cx={x(lastIndex)}
          cy={y(daily[lastIndex] ?? 0)}
          fill="#0a6c78"
          r="4"
          stroke="#fffdf8"
          strokeWidth="2"
        />
        {active !== null &&
        activeValue !== undefined &&
        activeValue !== null ? (
          <g>
            <line
              stroke="rgba(22,35,46,.28)"
              x1={x(active)}
              x2={x(active)}
              y1={margin.top}
              y2={y(0)}
            />
            <circle
              cx={x(active)}
              cy={y(activeValue)}
              fill="#0a6c78"
              r="5"
              stroke="#fffdf8"
              strokeWidth="2.5"
            />
          </g>
        ) : null}
      </svg>
      {active !== null &&
      activeValue !== undefined &&
      activeValue !== null &&
      activePrevious ? (
        <div
          className="pointer-events-none absolute top-0 min-w-[9.5rem] rounded-[0.5rem] border border-[#e2ded4] bg-[#fffdf8] px-3 py-2.5 text-[12px] shadow-[0_12px_30px_-12px_rgba(22,35,46,0.35)]"
          style={{
            left: `${(x(active) / width) * 100}%`,
            transform: `translateX(${active > lastIndex / 2 ? "calc(-100% - 12px)" : "12px"})`,
          }}
        >
          <p className="font-semibold text-[#16232e]">
            {active === lastIndex ? "Hoy" : `Hace ${lastIndex - active} días`}
          </p>
          <p className="mt-1 flex items-center justify-between gap-3 text-[#52646d]">
            Accesos
            <strong className="font-display text-[14px] text-[#16232e]">
              {count(activeValue)}
            </strong>
          </p>
          <p className="flex items-center justify-between gap-3 text-[#66777f]">
            Periodo anterior
            <span className="tabular-nums">{count(activePrevious)}</span>
          </p>
        </div>
      ) : null}
      <p className="mt-2 flex items-center gap-4 text-[12px] text-[#66777f]">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-[#0a6c78]" />
          Este periodo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-[1.5px] border-dashed border-[#82928f]" />
          Periodo anterior
        </span>
      </p>
    </div>
  );
}

function Donut({ sample }: { sample: ResumenSample }) {
  const { channelShares, taps } = sample;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const gap = 2.5;
  let offset = 0;
  const segments = channelShares.map((channel) => {
    const length = channel.share * circumference;
    const segment = {
      ...channel,
      dash: `${Math.max(length - gap, 0)} ${circumference}`,
      offset: -offset,
    };
    offset += length;
    return segment;
  });
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg
        aria-label={`Reparto por canal: ${channelShares.map((channel) => `${channel.label} ${Math.round(channel.share * 100)} %`).join(", ")}.`}
        className="size-36 shrink-0"
        role="img"
        viewBox="0 0 140 140"
      >
        <g transform="rotate(-90 70 70)">
          <circle
            cx="70"
            cy="70"
            fill="none"
            r={radius}
            stroke="#d9ded8"
            strokeWidth="16"
          />
          {segments.map((segment) => (
            <circle
              cx="70"
              cy="70"
              fill="none"
              key={segment.id}
              r={radius}
              stroke={segment.color}
              strokeDasharray={segment.dash}
              strokeDashoffset={segment.offset}
              strokeWidth="16"
            />
          ))}
        </g>
        <text
          className="fill-[#16232e] font-display text-[24px] font-semibold"
          textAnchor="middle"
          x="70"
          y="72"
        >
          {count(taps)}
        </text>
        <text
          className="fill-[#66777f] text-[10px]"
          textAnchor="middle"
          x="70"
          y="90"
        >
          accesos
        </text>
      </svg>
      <ul className="min-w-[9rem] flex-1 text-[13px]">
        {channelShares.map((channel) => (
          <li
            className="flex items-center gap-2 border-b border-[#d9ded8] py-2 last:border-b-0"
            key={channel.id}
          >
            <span
              className="size-2.5 rounded-sm"
              style={{ background: channel.color }}
            />
            <span className="flex-1 text-[#16232e]">{channel.label}</span>
            <strong className="text-[#16232e]">
              {Math.round(channel.share * 100)} %
            </strong>
            <span className="w-12 text-right text-[#66777f] tabular-nums">
              {count(Math.round(channel.share * taps))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Heatmap({ sample }: { sample: ResumenSample }) {
  const { heat } = sample;
  const [active, setActive] = useState<{ day: number; hour: number } | null>(
    null,
  );
  const max = Math.max(...heat.flat());
  const value = active ? (heat[active.day]?.[active.hour] ?? 0) : null;
  return (
    <div>
      <div
        aria-label={sample.heatSummary}
        className="grid grid-cols-[1.6rem_repeat(24,minmax(0,1fr))] gap-[2px] sm:grid-cols-[2.4rem_repeat(24,minmax(0,1fr))] sm:gap-[3px]"
        onPointerLeave={() => setActive(null)}
        role="img"
      >
        <span />
        {Array.from({ length: 24 }, (_, hour) => (
          <span
            className="text-center text-[9px] text-[#66777f] tabular-nums sm:text-[10px]"
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed 24 hours.
            key={hour}
          >
            {hour % 3 === 0 ? `${String(hour).padStart(2, "0")}h` : ""}
          </span>
        ))}
        {heat.map((row, day) => (
          <HeatRow
            active={active}
            day={day}
            key={weekdays[day]}
            max={max}
            onEnter={(hour) => setActive({ day, hour })}
            row={row}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[12px] text-[#66777f]">
        <p aria-live="polite" className="min-h-[1.2em]">
          {active && value !== null
            ? `${weekdayNames[active.day]}, ${active.hour} h: ${value} accesos`
            : "Pasa el cursor por el mapa para ver cada hora."}
        </p>
        <span className="flex items-center gap-2">
          Menos
          <span
            className="h-2 w-20 rounded-full"
            style={{ background: `linear-gradient(90deg, ${ramp.join(", ")})` }}
          />
          Más
        </span>
      </div>
    </div>
  );
}

function HeatRow({
  day,
  row,
  max,
  active,
  onEnter,
}: {
  day: number;
  row: number[];
  max: number;
  active: { day: number; hour: number } | null;
  onEnter: (hour: number) => void;
}) {
  return (
    <>
      <span className="self-center text-[10px] text-[#66777f] sm:text-[11px]">
        {weekdays[day]}
      </span>
      {row.map((value, hour) => {
        const step = Math.min(4, Math.floor((value / max) * 5));
        const isActive = active?.day === day && active.hour === hour;
        return (
          <span
            className={`min-h-[0.55rem] rounded-[3px] transition-transform ${isActive ? "scale-110 shadow-[0_0_0_2px_#fffdf8,0_0_0_4px_#0a6c78]" : ""}`}
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed 24 hours.
            key={hour}
            onPointerEnter={() => onEnter(hour)}
            style={
              value === 0
                ? {
                    background: "#f7f5f0",
                    boxShadow: "inset 0 0 0 1px #d9ded8",
                  }
                : { background: ramp[step] }
            }
          />
        );
      })}
    </>
  );
}

function Ranking({ sample }: { sample: ResumenSample }) {
  const { ranking, taps } = sample;
  const top = ranking[0]?.value ?? 1;
  return (
    <ol className="grid gap-3">
      {ranking.map((row) => (
        <li key={row.name}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="font-semibold text-[#0a6c78]">{row.name}</span>
            <span className="text-[#16232e] tabular-nums">
              <strong className="font-semibold">{count(row.value)}</strong>
              <span className="ml-2 text-[#66777f]">
                {percent((row.value / taps) * 100, 0)}
              </span>
            </span>
          </div>
          <div className="mt-1.5 h-[0.4rem] rounded-full bg-[#f7f5f0] shadow-[inset_0_0_0_1px_#d9ded8]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#0a6c78] to-[#4ec3ce]"
              style={{ width: `${Math.max(2, (row.value / top) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Funnel({ sample }: { sample: ResumenSample }) {
  const { taps, clicks, leads } = sample;
  const stages = [
    { label: "Accesos", value: taps, note: null },
    {
      label: "Clics",
      value: clicks,
      note: `${percent((clicks / taps) * 100)} de los accesos`,
    },
    {
      label: "Solicitudes",
      value: leads,
      note: `${percent((leads / clicks) * 100)} de los clics`,
    },
  ];
  return (
    <ol className="grid gap-3.5">
      {stages.map((stage) => (
        <li key={stage.label}>
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="font-semibold text-[#16232e]">{stage.label}</span>
            <strong className="font-display text-[15px] font-semibold text-[#16232e]">
              {count(stage.value)}
            </strong>
          </div>
          <div className="mt-1.5 h-6 rounded-md bg-[#f7f5f0] shadow-[inset_0_0_0_1px_#d9ded8]">
            <div
              className="h-full rounded-md bg-gradient-to-r from-[#0a6c78] to-[#4ec3ce]"
              style={{ width: `${Math.max(4, (stage.value / taps) * 100)}%` }}
            />
          </div>
          {stage.note ? (
            <p className="mt-1 text-[12px] text-[#66777f]">{stage.note}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
