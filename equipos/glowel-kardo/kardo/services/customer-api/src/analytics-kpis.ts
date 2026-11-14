import type { AnalyticsKpis, ChannelCounts } from "@kardo/contracts";

type Counts = { taps: number; clicks: number; leads: number };
type ChannelKey = keyof ChannelCounts;

export type KpiInput = {
  days: number;
  current: Counts & { channels: ChannelCounts };
  /** Null when Analytics Engine did not answer (taps/clicks unknown). */
  previous: (Counts & { channels: ChannelCounts }) | null;
  /** Leads of the previous period are always known (Postgres). */
  previousLeads: number;
  daily: readonly { date: string; taps: number }[];
  /** Taps per local hour of day (0–23), current and previous period. */
  hoursOfDay: readonly number[];
  previousHoursOfDay: readonly number[] | null;
  touchpoints: { active: number; total: number };
  reached: number;
  previousReached: number | null;
};

function rate(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

function argmax(values: readonly number[]): number | null {
  let best: number | null = null;
  values.forEach((value, index) => {
    if (value > 0 && (best === null || value > (values[best] ?? 0)))
      best = index;
  });
  return best;
}

function topChannel(channels: ChannelCounts): ChannelKey | null {
  const keys: ChannelKey[] = ["nfc", "qr", "link"];
  const best = argmax(keys.map((key) => channels[key]));
  return best === null ? null : (keys[best] ?? null);
}

/**
 * The Resumen indicators, each with its previous-period value. Rates are
 * compared only when the previous period had taps to divide by.
 */
export function buildKpis(input: KpiInput): AnalyticsKpis {
  const { current, previous, days } = input;
  const previousTaps = previous?.taps ?? null;
  const channelTotal =
    current.channels.nfc + current.channels.qr + current.channels.link;
  const channel = topChannel(current.channels);
  const hourTotal = input.hoursOfDay.reduce((sum, value) => sum + value, 0);
  const peakHour = argmax(input.hoursOfDay);
  const peakDay = input.daily.reduce<{ date: string; taps: number } | null>(
    (best, day) => (day.taps > (best?.taps ?? 0) ? day : best),
    null,
  );

  return {
    taps: { value: current.taps, previous: previousTaps },
    clicks: { value: current.clicks, previous: previous?.clicks ?? null },
    leads: { value: current.leads, previous: input.previousLeads },
    conversionRate: {
      value: rate(current.leads, current.taps),
      previous:
        previousTaps && previousTaps > 0
          ? rate(input.previousLeads, previousTaps)
          : null,
    },
    interactionRate: {
      value: rate(current.clicks, current.taps),
      previous:
        previous && previous.taps > 0
          ? rate(previous.clicks, previous.taps)
          : null,
    },
    dailyAverage: {
      value: current.taps / Math.max(1, days),
      previous: previousTaps === null ? null : previousTaps / Math.max(1, days),
    },
    touchpoints: input.touchpoints,
    reachedTouchpoints: {
      value: input.reached,
      previous: input.previousReached,
    },
    peakHour: {
      hour: peakHour,
      share:
        peakHour === null
          ? 0
          : rate(input.hoursOfDay[peakHour] ?? 0, hourTotal),
      previousHour: input.previousHoursOfDay
        ? argmax(input.previousHoursOfDay)
        : null,
    },
    topChannel: {
      channel,
      share:
        channel === null ? 0 : rate(current.channels[channel], channelTotal),
      previousChannel: previous ? topChannel(previous.channels) : null,
    },
    peakDay: { date: peakDay?.date ?? null, taps: peakDay?.taps ?? 0 },
  };
}
