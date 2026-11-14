"use client";

import {
  AtSign,
  ChartColumn,
  Inbox,
  Layers,
  LayoutGrid,
  ListChecks,
  Nfc,
  QrCode,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { Logo } from "../Logo";
import {
  type HeroBusiness,
  heroBusinesses,
  type RankingRow,
  type SectionWindow,
} from "./businesses";

/*
  The platform at work, drawn in HTML: the business's panel (the real
  sidebar and a Resumen with its KPI cards, the channel split and the card
  of the part of Kardo that business lives on) and, in front, the page its
  customers open. Everything changes with the word of the title.

  The drawing has a fixed size in CSS px (--hv-w x --hv-h) and is scaled as
  a whole with a plain 2D scale: the wrapper keeps the ratio of the part it
  shows (--hv-view px wide) in CSS and a ResizeObserver sets the scale as a
  number. No matrix3d, perspective or container-unit math, which rendered
  wrong in Safari before.
  Decorative for assistive tech: the h1 and the lead say the same.
*/

const channelColors = ["#0a6c78", "#4ec3ce", "#16232e"] as const;
const channelNames = ["NFC", "QR", "URL directa"] as const;
const number = new Intl.NumberFormat("es-MX");

export function HeroVisual({ active }: { active: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const measure = () => {
      const width = box.clientWidth;
      const view = Number.parseFloat(
        getComputedStyle(box).getPropertyValue("--hv-view"),
      );
      if (width > 0 && view > 0)
        box.style.setProperty("--hv-scale", String(width / view));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  return (
    <div aria-hidden="true" className="hv" inert ref={ref}>
      <div className="hv-canvas">
        <PanelWindow active={active} />
        <SectionPanel active={active} />
        <PhoneFrame active={active} />
      </div>
    </div>
  );
}

/** Children stacked in one cell; only the active one shows. */
function Swap({
  active,
  children,
  className = "",
}: {
  active: number;
  children: ReactNode[];
  className?: string;
}) {
  return (
    <span className={`hv-swap ${className}`}>
      {children.map((child, index) => (
        <span
          className="hv-swap-item"
          data-on={index === active ? "" : undefined}
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed list
          key={index}
        >
          {child}
        </span>
      ))}
    </span>
  );
}

const nav: { group?: string; items: [ReactNode, string][] }[] = [
  { items: [[<LayoutGrid key="i" />, "Resumen"]] },
  {
    group: "Físico",
    items: [
      [<Nfc key="i" />, "QR y etiquetas"],
      [<QrCode key="i" />, "Diseño del QR"],
    ],
  },
  { group: "Digital", items: [[<AtSign key="i" />, "Links"]] },
  {
    group: "Contenido",
    items: [
      [<Layers key="i" />, "Páginas"],
      [<ListChecks key="i" />, "Disponibilidad"],
    ],
  },
  {
    group: "Resultados",
    items: [
      [<ChartColumn key="i" />, "Analítica"],
      [<Inbox key="i" />, "Solicitudes"],
    ],
  },
];

function PanelWindow({ active }: { active: number }) {
  const businesses = heroBusinesses;
  return (
    <div className="hv-panel">
      <aside className="hv-sidebar">
        <Logo className="hv-logo" tone="dark" />
        <div className="hv-switcher">
          <Swap active={active} className="hv-avatar">
            {businesses.map((business) => (
              <span key={business.id} style={business.tile}>
                <business.Mark className="hv-avatar-mark" />
              </span>
            ))}
          </Swap>
          <span className="min-w-0 flex-1">
            <Swap active={active} className="hv-org">
              {businesses.map((business) => business.org)}
            </Swap>
            <Swap active={active} className="hv-kind">
              {businesses.map((business) => business.kind)}
            </Swap>
          </span>
        </div>
        <nav className="hv-nav">
          {nav.map((section) => (
            <div key={section.group ?? "inicio"}>
              {section.group ? (
                <p className="hv-group">{section.group}</p>
              ) : null}
              {section.items.map(([icon, label]) => (
                <p
                  className="hv-item"
                  data-current={label === "Resumen" ? "" : undefined}
                  key={label}
                >
                  {icon}
                  {label}
                </p>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="hv-main">
        <div className="hv-head">
          <p className="hv-title">Resumen</p>
          <p className="hv-period">Últimos 30 días</p>
        </div>

        <div className="hv-kpis">
          <Kpi
            active={active}
            deltas={businesses.map((business) => business.visitsDelta)}
            label="Accesos"
            series={businesses.map((business) => business.visitSeries)}
            values={businesses.map((business) => business.visits)}
          />
          <Kpi
            active={active}
            deltas={businesses.map((business) => business.clicksDelta)}
            label="Clics en acciones"
            series={businesses.map((business) => business.clickSeries)}
            values={businesses.map((business) => business.clicks)}
          />
        </div>

        <section className="hv-card">
          <p className="hv-card-title">Reparto por canal</p>
          <Swap active={active} className="hv-block">
            {businesses.map((business) => (
              <ChannelSplit business={business} key={business.id} />
            ))}
          </Swap>
        </section>

        <section className="hv-card hv-ranking">
          <p className="hv-card-title">QR y etiquetas con más accesos</p>
          <Swap active={active} className="hv-block">
            {businesses.map((business) => (
              <Ranking key={business.id} rows={business.ranking} />
            ))}
          </Swap>
        </section>
      </div>
    </div>
  );
}

function Kpi({
  label,
  values,
  deltas,
  series,
  active,
}: {
  label: string;
  values: number[];
  deltas: number[];
  series: number[][];
  active: number;
}) {
  return (
    <section className="hv-card hv-kpi">
      <p className="hv-kpi-label">{label}</p>
      <p className="hv-kpi-row">
        <Swap active={active} className="hv-kpi-value">
          {values.map((value) => number.format(value))}
        </Swap>
        <Swap active={active} className="hv-delta">
          {deltas.map((delta) => `▲ ${delta} %`)}
        </Swap>
      </p>
      <Swap active={active} className="hv-block">
        {series.map((points, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed list
          <Sparkline key={index} points={points} />
        ))}
      </Swap>
    </section>
  );
}

/** The KPI card's trend line: gradient area and a dot on the last day. */
function Sparkline({ points }: { points: number[] }) {
  const id = useId();
  const width = 150;
  const height = 34;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const xy = points.map(
    (value, index) =>
      [
        (index / (points.length - 1)) * (width - 4) + 2,
        height - 3 - ((value - min) / (max - min || 1)) * (height - 8),
      ] as const,
  );
  const line = xy.map(([x, y], index) => `${index ? "L" : "M"}${x} ${y}`);
  const last = xy[xy.length - 1] ?? [0, 0];
  return (
    <svg
      aria-hidden="true"
      className="hv-spark"
      viewBox={`0 0 ${width} ${height}`}
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#0a6c78" stopOpacity="0.2" />
          <stop offset="1" stopColor="#0a6c78" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${line.join(" ")} L${width - 2} ${height} L2 ${height} Z`}
        fill={`url(#${id})`}
      />
      <path
        d={line.join(" ")}
        fill="none"
        stroke="#0a6c78"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle cx={last[0]} cy={last[1]} fill="#0a6c78" r="2.6" />
    </svg>
  );
}

function ChannelSplit({ business }: { business: HeroBusiness }) {
  return (
    <span className="hv-block">
      <span className="hv-bar">
        {business.channels.map((share, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed channels
            key={index}
            style={{ width: `${share}%`, background: channelColors[index] }}
          />
        ))}
      </span>
      <span className="hv-legend">
        {business.channels.map((share, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed channels
          <span key={index}>
            <i style={{ background: channelColors[index] }} />
            {channelNames[index]}
            <b>{share} %</b>
          </span>
        ))}
      </span>
    </span>
  );
}

/** The Resumen's Ranking widget: Touchpoints by Accesos. */
function Ranking({ rows }: { rows: RankingRow[] }) {
  return (
    <span className="hv-block">
      {rows.map((row) => (
        <span className="hv-row" key={row.name}>
          <span className="hv-row-name">
            {row.name}
            <small>{row.channel}</small>
          </span>
          <span className="hv-row-value">{number.format(row.visits)}</span>
        </span>
      ))}
    </span>
  );
}

/**
 * The section this business lives on, as its own window over the Resumen
 * (in the panel they are separate pages): Disponibilidad or Leads. It
 * hides for a business that lives on the Resumen alone.
 */
function SectionPanel({ active }: { active: number }) {
  const shown = heroBusinesses[active]?.section;
  return (
    <div className="hv-window" data-on={shown ? "" : undefined}>
      <Swap active={active} className="hv-block">
        {heroBusinesses.map((business) =>
          business.section ? (
            <SectionBody key={business.id} section={business.section} />
          ) : (
            <span key={business.id} />
          ),
        )}
      </Swap>
    </div>
  );
}

function SectionBody({ section }: { section: SectionWindow }) {
  if (section.kind === "availability")
    return (
      <span className="hv-block">
        <span className="hv-window-head">
          <ListChecks />
          Disponibilidad
        </span>
        {section.items.map((item) => (
          <span className="hv-row" key={item.name}>
            <span className="hv-row-name">{item.name}</span>
            <span className={`hv-state hv-state-${item.state}`}>
              {item.state === "soldOut"
                ? "Agotado"
                : item.state === "low"
                  ? `Quedan ${item.remaining}`
                  : "Disponible"}
            </span>
          </span>
        ))}
      </span>
    );
  return (
    <span className="hv-block">
      <span className="hv-window-head">
        <Inbox />
        Solicitudes
      </span>
      {section.rows.map((row) => (
        <span className="hv-row" key={row.name}>
          <span className="hv-row-name">
            {row.name}
            <small>{row.touchpoint}</small>
          </span>
          <span className="hv-row-end">
            <span className="hv-row-meta">{row.date}</span>
            <span
              className={`hv-state ${row.status === "Nueva" ? "hv-state-new" : "hv-state-done"}`}
            >
              {row.status}
            </span>
          </span>
        </span>
      ))}
    </span>
  );
}

/** The customer's phone with the page of the business, laid out at 390 px. */
function PhoneFrame({ active }: { active: number }) {
  return (
    <div className="hv-phone">
      <div className="hv-screen">
        <div className="hv-viewport">
          {heroBusinesses.map((business, index) => (
            <div
              className="hv-page"
              data-on={index === active ? "" : undefined}
              key={business.id}
            >
              <business.Page />
              <StatusBar light={business.statusLight} />
            </div>
          ))}
          <span className="hv-island" />
          <span className="hv-home" />
        </div>
      </div>
    </div>
  );
}

/** A phone's status bar, at the 390 px of the page. */
function StatusBar({ light }: { light: boolean }) {
  return (
    <div className={`hv-status ${light ? "text-white" : "text-ink"}`}>
      <span className="font-display">9:41</span>
      <span className="flex items-center gap-[7px]">
        <svg
          aria-hidden="true"
          className="h-[12px] w-[19px]"
          fill="currentColor"
          viewBox="0 0 16 10"
        >
          <rect height="4" rx="1" width="3" x="0" y="6" />
          <rect height="6" rx="1" width="3" x="4.3" y="4" />
          <rect height="8" rx="1" width="3" x="8.6" y="2" />
          <rect height="10" rx="1" width="3" x="12.9" y="0" />
        </svg>
        <svg
          aria-hidden="true"
          className="h-[12px] w-[17px]"
          fill="currentColor"
          viewBox="0 0 14 10"
        >
          <path d="M7 10 4.9 7.6a3 3 0 0 1 4.2 0Z" />
          <path d="M2.8 5.5a6 6 0 0 1 8.4 0l-1 1.1a4.5 4.5 0 0 0-6.4 0Z" />
          <path d="M.7 3.4a9 9 0 0 1 12.6 0l-1 1.1a7.5 7.5 0 0 0-10.6 0Z" />
        </svg>
        <span className="relative h-[13px] w-[26px] rounded-[4px] border border-current/60 p-[2px]">
          <span className="block h-full w-[70%] rounded-[2px] bg-current" />
        </span>
      </span>
    </div>
  );
}
