import type { DemoBusinessId } from "@/lib/demo-business";

/*
  Example numbers for the Resumen replica, one set per business of the
  live demo (the café, the florería, the salon): last 30 days against the
  30 before. Deterministic, so the static export never changes. They follow
  the demo: leads only come from a Formulario de contacto, so the café and
  the florería have none; URL directa is the ad's own point (and, for the
  florería, its Link), never the tables' address.
*/

export interface ChannelShare {
  id: "nfc" | "qr" | "link";
  label: string;
  share: number;
  color: string;
}

export interface ResumenSample {
  business: string;
  daily: number[];
  previousDaily: number[];
  taps: number;
  previousTaps: number;
  clicks: number;
  previousClicks: number;
  leads: number;
  previousLeads: number;
  /** Last 14 days, for the KPI sparklines. */
  clickSeries: number[];
  leadSeries: number[];
  conversionSeries: number[];
  channelShares: ChannelShare[];
  ranking: { name: string; value: number }[];
  /** Visits by weekday (rows, Monday first) and hour (columns). */
  heat: number[][];
  /** What the heatmap shows, for screen readers. */
  heatSummary: string;
  /** Top of the trend chart's axis. */
  yMax: number;
}

export const weekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
export const weekdayNames = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

const sum = (values: number[]) =>
  values.reduce((total, value) => total + value, 0);

/** Channel colors of the panel (overview/widgets/charts/aggregate.ts). */
function shares(nfc: number, qr: number, link: number): ChannelShare[] {
  return [
    { id: "nfc", label: "NFC", share: nfc, color: "#0a6c78" },
    { id: "qr", label: "QR", share: qr, color: "#4ec3ce" },
    { id: "link", label: "URL directa", share: link, color: "#16232e" },
  ];
}

function heatmap(cell: (day: number, hour: number) => number): number[][] {
  return weekdays.map((_, day) =>
    Array.from({ length: 24 }, (_, hour) => cell(day, hour)),
  );
}

function build(spec: {
  business: string;
  daily: number[];
  previousFactor: (index: number) => number;
  clickRate: number;
  previousClickRate: number;
  clickFactor: (index: number) => number;
  leads: number;
  previousLeads: number;
  leadSeries: number[];
  channelShares: ChannelShare[];
  ranking: { name: string; value?: number; share?: number }[];
  heat: number[][];
  heatSummary: string;
  yMax: number;
}): ResumenSample {
  const previousDaily = spec.daily.map((value, index) =>
    Math.round(value * spec.previousFactor(index)),
  );
  const taps = sum(spec.daily);
  const previousTaps = sum(previousDaily);
  const last14 = spec.daily.slice(-14);
  return {
    business: spec.business,
    daily: spec.daily,
    previousDaily,
    taps,
    previousTaps,
    clicks: Math.round(taps * spec.clickRate),
    previousClicks: Math.round(previousTaps * spec.previousClickRate),
    leads: spec.leads,
    previousLeads: spec.previousLeads,
    clickSeries: last14.map((value, index) =>
      Math.round(value * spec.clickFactor(index)),
    ),
    leadSeries: spec.leadSeries,
    conversionSeries: last14.map(
      (value, index) =>
        Math.round(((spec.leadSeries[index] ?? 0) / value) * 1000) / 10,
    ),
    channelShares: spec.channelShares,
    ranking: spec.ranking.map((row) => ({
      name: row.name,
      value: row.value ?? Math.round((row.share ?? 0) * taps),
    })),
    heat: spec.heat,
    heatSummary: spec.heatSummary,
    yMax: spec.yMax,
  };
}

const noLeads = Array.from({ length: 14 }, () => 0);

const cafe = build({
  business: "Café Central",
  daily: [
    132, 141, 128, 150, 176, 212, 198, 139, 145, 137, 158, 181, 219, 205, 146,
    151, 142, 163, 188, 226, 211, 150, 157, 149, 171, 195, 234, 218, 158, 166,
  ],
  previousFactor: (index) => 0.82 + ((index * 5) % 7) / 100,
  clickRate: 0.255,
  previousClickRate: 0.27,
  clickFactor: (index) => 0.23 + (index % 4) * 0.012,
  // No Formulario in the café: no leads.
  leads: 0,
  previousLeads: 0,
  leadSeries: noLeads,
  channelShares: shares(0.55, 0.38, 0.07),
  ranking: [
    { name: "Mesa 4", value: 412 },
    { name: "Mesa 7", value: 388 },
    { name: "Anuncio en redes", value: 360 },
    { name: "Barra", value: 351 },
    { name: "Mesa 12", value: 296 },
  ],
  heat: heatmap((day, hour) => {
    if (hour < 8 || hour > 21) return 0;
    const morning = Math.exp(-((hour - 9.5) ** 2) / 3);
    const lunch = Math.exp(-((hour - 14) ** 2) / 2.5) * 0.9;
    const evening = Math.exp(-((hour - 18.5) ** 2) / 4) * 0.6;
    const weekend = day >= 5 ? 1.35 : day === 4 ? 1.12 : 1;
    return Math.round((morning + lunch + evening + 0.12) * weekend * 26);
  }),
  heatSummary:
    "Actividad por día y hora: más visitas entre 9 y 10 de la mañana y entre 1 y 3 de la tarde, sobre todo el fin de semana.",
  yMax: 250,
});

const floreria = build({
  business: "Florería Lila",
  daily: [
    41, 44, 47, 52, 66, 84, 58, 43, 46, 49, 55, 70, 88, 61, 45, 48, 51, 57, 73,
    92, 63, 47, 50, 54, 60, 77, 95, 66, 49, 53,
  ],
  previousFactor: (index) => 0.78 + ((index * 3) % 7) / 100,
  clickRate: 0.42,
  previousClickRate: 0.38,
  clickFactor: (index) => 0.4 + (index % 3) * 0.02,
  // No Formulario in the florería: no leads.
  leads: 0,
  previousLeads: 0,
  leadSeries: noLeads,
  // URL directa: its Link (@florerialila) and its ad, each a point of its own.
  channelShares: shares(0.17, 0.33, 0.5),
  ranking: [
    { name: "@florerialila", share: 0.38 },
    { name: "Mostrador", share: 0.3 },
    { name: "Aparador", share: 0.2 },
    { name: "Anuncio en redes", share: 0.12 },
  ],
  heat: heatmap((day, hour) => {
    // Late at night the visits come from its Link, shared on Instagram.
    const night = hour >= 21 && hour <= 23 ? 0.08 : 0;
    if ((hour < 10 || hour > 20) && night === 0) return 0;
    const noon = Math.exp(-((hour - 13) ** 2) / 3) * 0.6;
    const evening = Math.exp(-((hour - 18.5) ** 2) / 2.5);
    const factor = [0.55, 0.75, 0.8, 0.9, 1.25, 1.55, 1.05][day] ?? 1;
    return Math.round((noon + evening + 0.12 + night) * factor * 9);
  }),
  heatSummary:
    "Actividad por día y hora: más visitas entre 6 y 8 de la tarde, sobre todo viernes y sábado, y algunas de noche desde su Link.",
  yMax: 100,
});

const estudio = build({
  business: "Estudio Noa",
  daily: [
    26, 28, 30, 31, 36, 40, 9, 27, 29, 31, 33, 38, 42, 10, 28, 30, 32, 34, 39,
    44, 11, 29, 31, 33, 35, 41, 46, 12, 30, 32,
  ],
  previousFactor: (index) => 0.8 + ((index * 2) % 5) / 100,
  clickRate: 0.31,
  previousClickRate: 0.29,
  clickFactor: (index) => 0.29 + (index % 4) * 0.01,
  leads: 41,
  previousLeads: 30,
  leadSeries: [2, 1, 2, 1, 3, 3, 0, 1, 2, 2, 1, 3, 4, 0],
  // URL directa: the ad, its own point.
  channelShares: shares(0.52, 0.36, 0.12),
  ranking: [
    { name: "Recepción", share: 0.56 },
    { name: "Espejo 1", share: 0.17 },
    { name: "Espejo 2", share: 0.15 },
    { name: "Anuncio en redes", share: 0.12 },
  ],
  heat: heatmap((day, hour) => {
    // Closed on Sundays: only a few visits from its ad.
    if (day === 6) return hour >= 11 && hour <= 14 ? 1 : 0;
    if (hour < 10 || hour > 20) return 0;
    const noon = Math.exp(-((hour - 12.5) ** 2) / 2.5);
    const evening = Math.exp(-((hour - 17.5) ** 2) / 3) * 0.85;
    const factor = [0.8, 0.85, 0.9, 1, 1.15, 1.3][day] ?? 1;
    return Math.round((noon + evening + 0.15) * factor * 7);
  }),
  heatSummary:
    "Actividad por día y hora: más visitas entre 12 y 1 de la tarde y entre 5 y 6 de la tarde, de lunes a sábado. Los domingos cierra.",
  yMax: 50,
});

export const samples: Record<DemoBusinessId, ResumenSample> = {
  cafe,
  floreria,
  estudio,
};

/**
 * Relative change as the panel prints it: "▲ 18 %". Null with nothing to
 * compare against, like the panel's percentChange(): the card then shows no
 * trend at all.
 */
export function delta(current: number, previous: number) {
  if (previous <= 0) return null;
  const change = ((current - previous) / previous) * 100;
  const rounded =
    Math.abs(change) < 10 ? Math.round(change * 10) / 10 : Math.round(change);
  const direction = rounded > 0 ? "up" : rounded < 0 ? "down" : "flat";
  const number = new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 1,
  }).format(Math.abs(rounded));
  const text =
    direction === "up"
      ? `▲ ${number} %`
      : direction === "down"
        ? `▼ ${number} %`
        : "0 %";
  return { direction, text } as const;
}

export const count = (value: number) =>
  new Intl.NumberFormat("es-MX").format(value);
