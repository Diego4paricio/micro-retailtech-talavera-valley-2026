import type {
  AnalyticsSummary,
  ChannelCounts,
  ExperienceSummary,
  Touchpoint,
  TouchpointGroup,
} from "@kardo/contracts";
import type { AnalyticsRange } from "../../../api/analytics.js";
import type { WidgetContext } from "./types.js";

/**
 * Example numbers for the widget gallery: a small café with two zones, its
 * Touchpoints and Experiences, generated from a fixed seed so every preview
 * shows the same, realistic shape — whatever the workspace's own data (a new
 * account has none yet). Never shown as the customer's figures.
 */

function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

const id = (n: number) =>
  `5a3e1c00-0000-4000-8000-${String(n).padStart(12, "0")}`;

const terraza = id(901);
const salon = id(902);

const sampleGroups: TouchpointGroup[] = [
  { id: terraza, name: "Terraza", description: null, touchpointCount: 3 },
  { id: salon, name: "Salón", description: null, touchpointCount: 3 },
];

type SampleTouchpoint = {
  n: number;
  name: string;
  kind: "nfc" | "qr";
  group: string | null;
  /** Share of the café's accesses; 0 = active but unused (for "sin accesos"). */
  share: number;
};

const touchpointSpecs: SampleTouchpoint[] = [
  { n: 1, name: "Terraza · Mesa 1", kind: "nfc", group: terraza, share: 0.19 },
  { n: 2, name: "Terraza · Mesa 2", kind: "nfc", group: terraza, share: 0.14 },
  { n: 3, name: "Terraza · Mesa 3", kind: "qr", group: terraza, share: 0 },
  { n: 4, name: "Salón · Mesa 1", kind: "qr", group: salon, share: 0.17 },
  { n: 5, name: "Salón · Mesa 2", kind: "qr", group: salon, share: 0.11 },
  { n: 6, name: "Salón · Barra", kind: "nfc", group: salon, share: 0.09 },
  { n: 7, name: "Mostrador · Caja", kind: "qr", group: null, share: 0.21 },
  { n: 8, name: "Tarjeta de Ana", kind: "nfc", group: null, share: 0.09 },
];

const sampleTouchpoints: Touchpoint[] = touchpointSpecs.map((spec) => ({
  id: id(spec.n),
  publicId: `sample${String(spec.n).padStart(10, "0")}`,
  operationalName: spec.name,
  physicalType: spec.kind === "nfc" ? "card" : "label",
  kind: spec.kind,
  status: "active",
  groupId: spec.group,
}));

const experienceSpecs = [
  { n: 101, name: "Carta de temporada", type: "menu", share: 0.58 },
  { n: 102, name: "Reservas para eventos", type: "form", share: 0.16 },
  { n: 103, name: "Perfil de Ana", type: "profile", share: 0.12 },
  { n: 104, name: "Promociones de la semana", type: "links", share: 0.14 },
] as const;

const sampleExperiences: ExperienceSummary[] = experienceSpecs.map((spec) => ({
  id: id(spec.n),
  touchpointId: null,
  name: spec.name,
  type: spec.type,
  content: {} as ExperienceSummary["content"],
  publicationStatus: "published",
}));

/** A café's day: breakfast and lunch peaks, quieter on Mondays. */
const weekdayFactor = [0.78, 0.88, 0.94, 1, 1.24, 1.38, 1.18]; // Mon…Sun
const hourCurve = Array.from({ length: 24 }, (_, hour) => {
  if (hour < 8 || hour > 21) return 0;
  const peaks: Record<number, number> = {
    8: 0.55,
    9: 0.95,
    10: 0.8,
    11: 0.5,
    12: 0.55,
    13: 0.9,
    14: 1,
    15: 0.6,
    16: 0.4,
    17: 0.45,
    18: 0.55,
    19: 0.5,
    20: 0.3,
    21: 0.18,
  };
  return peaks[hour] ?? 0.2;
});

function localDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function shiftDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function split(total: number, shares: readonly number[]): number[] {
  const parts = shares.map((share) => Math.round(total * share));
  const drift = total - parts.reduce((sum, value) => sum + value, 0);
  if (parts.length) parts[0] = (parts[0] ?? 0) + drift;
  return parts;
}

const channelShares = [0.52, 0.38, 0.1] as const;

function channelsOf(total: number): ChannelCounts {
  const [nfc = 0, qr = 0, link = 0] = split(total, channelShares);
  return { nfc, qr, link };
}

function rate(part: number, whole: number) {
  return whole > 0 ? part / whole : 0;
}

/** The example summary for `days`, ending today. */
export function sampleSummary(days: AnalyticsRange): AnalyticsSummary {
  const random = seeded(20260928 + days);
  const today = new Date();
  const dayTotal = (date: Date, scale: number) => {
    const weekday = (date.getDay() + 6) % 7;
    return Math.round(
      (26 * (weekdayFactor[weekday] ?? 1) + random() * 8) * scale,
    );
  };

  const daily = Array.from({ length: days }, (_, index) => {
    const date = shiftDays(today, index - (days - 1));
    const taps = dayTotal(date, 1);
    const clicks = Math.round(taps * (0.26 + random() * 0.06));
    const leads = Math.round(taps * (0.05 + random() * 0.03));
    return {
      date: localDateKey(date),
      taps,
      clicks,
      leads,
      channels: channelsOf(taps),
    };
  });
  const previousDaily = daily.map((day) => {
    const date = shiftDays(new Date(`${day.date}T12:00:00`), -days);
    const taps = dayTotal(date, 0.86);
    return {
      date: localDateKey(date),
      taps,
      clicks: Math.round(taps * 0.25),
      leads: Math.round(taps * 0.055),
    };
  });

  const sum = <K extends "taps" | "clicks" | "leads">(
    rows: readonly Record<K, number>[],
    key: K,
  ) => rows.reduce((total, row) => total + row[key], 0);
  const taps = sum(daily, "taps");
  const clicks = sum(daily, "clicks");
  const leads = sum(daily, "leads");
  const previous = {
    taps: sum(previousDaily, "taps"),
    clicks: sum(previousDaily, "clicks"),
    leads: sum(previousDaily, "leads"),
    channels: channelsOf(sum(previousDaily, "taps")),
  };
  const channels = channelsOf(taps);

  const weekdayHour = weekdayFactor.map((factor) => {
    const weight = hourCurve.reduce((total, value) => total + value, 0);
    const perDay = (taps / 7) * factor;
    return hourCurve.map((value) =>
      Math.round((perDay * value) / Math.max(1, weight)),
    );
  });
  const hoursOfDay = hourCurve.map((_, hour) =>
    weekdayHour.reduce((total, row) => total + (row[hour] ?? 0), 0),
  );
  const peakHour = hoursOfDay.indexOf(Math.max(...hoursOfDay));

  const now = new Date();
  now.setMinutes(0, 0, 0);
  const hourly = Array.from({ length: 24 }, (_, index) => {
    const hour = new Date(now.getTime() - (23 - index) * 3_600_000);
    const value = hourCurve[hour.getHours()] ?? 0;
    return {
      hour: hour.toISOString(),
      taps: Math.round(value * 5 + (value > 0 ? random() * 2 : 0)),
    };
  });

  const tapShares = touchpointSpecs.map((spec) => spec.share);
  const touchpointTaps = split(taps, tapShares);
  const touchpointClicks = split(clicks, tapShares);
  const touchpointLeads = split(leads, tapShares);
  const touchpoints = touchpointSpecs.map((spec, index) => {
    const value = touchpointTaps[index] ?? 0;
    return {
      touchpointId: id(spec.n),
      name: spec.name,
      kind: spec.kind,
      taps: value,
      clicks: touchpointClicks[index] ?? 0,
      leads: touchpointLeads[index] ?? 0,
      channels:
        spec.kind === "nfc"
          ? {
              nfc: Math.round(value * 0.9),
              qr: 0,
              link: value - Math.round(value * 0.9),
            }
          : {
              nfc: 0,
              qr: Math.round(value * 0.9),
              link: value - Math.round(value * 0.9),
            },
    };
  });

  const experienceShares = experienceSpecs.map((spec) => spec.share);
  const experienceTaps = split(taps, experienceShares);
  const experienceClicks = split(clicks, experienceShares);
  const experiences = experienceSpecs.map((spec, index) => ({
    experienceId: id(spec.n),
    name: spec.name,
    type: spec.type,
    taps: experienceTaps[index] ?? 0,
    clicks: experienceClicks[index] ?? 0,
    // Leads come from the contact form.
    leads: spec.type === "form" ? leads : 0,
  }));

  const groups = sampleGroups.map((group) => {
    const members = touchpointSpecs
      .map((spec, index) => ({ spec, index }))
      .filter(({ spec }) => spec.group === group.id);
    const total = (values: number[]) =>
      members.reduce((acc, { index }) => acc + (values[index] ?? 0), 0);
    return {
      groupId: group.id,
      name: group.name,
      // Flat sample groups (no nesting), so every one is top-level.
      depth: 0,
      taps: total(touchpointTaps),
      clicks: total(touchpointClicks),
      leads: total(touchpointLeads),
    };
  });

  const peakDay = daily.reduce((best, day) =>
    day.taps > best.taps ? day : best,
  );
  const active = sampleTouchpoints.length;
  const reached = touchpoints.filter((item) => item.taps > 0).length;

  return {
    source: "analytics_engine",
    days,
    generatedAt: new Date().toISOString(),
    previous,
    previousDaily,
    activeTouchpoints: active,
    totals: {
      taps,
      clicks,
      leads,
      channels,
      clickChannels: channelsOf(clicks),
    },
    daily,
    hourly,
    weekdayHour,
    touchpoints,
    experiences,
    groups,
    kpis: {
      taps: { value: taps, previous: previous.taps },
      clicks: { value: clicks, previous: previous.clicks },
      leads: { value: leads, previous: previous.leads },
      conversionRate: {
        value: rate(leads, taps),
        previous: rate(previous.leads, previous.taps),
      },
      interactionRate: {
        value: rate(clicks, taps),
        previous: rate(previous.clicks, previous.taps),
      },
      dailyAverage: { value: taps / days, previous: previous.taps / days },
      touchpoints: { active, total: active },
      reachedTouchpoints: { value: reached, previous: reached - 1 },
      peakHour: {
        hour: peakHour,
        share: rate(
          hoursOfDay[peakHour] ?? 0,
          hoursOfDay.reduce((a, b) => a + b, 0),
        ),
        previousHour: 9,
      },
      topChannel: {
        channel: "nfc",
        share: rate(channels.nfc, taps),
        previousChannel: "nfc",
      },
      peakDay: { date: peakDay.date, taps: peakDay.taps },
    },
  };
}

const cache = new Map<AnalyticsRange, WidgetContext>();

/** Everything a widget needs to draw the example (gallery previews). */
export function sampleWidgetContext(days: AnalyticsRange): WidgetContext {
  const hit = cache.get(days);
  if (hit) return hit;
  const context: WidgetContext = {
    data: sampleSummary(days),
    days,
    isStale: false,
    scope: { kind: "all" },
    touchpoints: sampleTouchpoints,
    experiences: sampleExperiences,
    groups: sampleGroups,
    canManage: false,
    engineAvailable: true,
  };
  cache.set(days, context);
  return context;
}
