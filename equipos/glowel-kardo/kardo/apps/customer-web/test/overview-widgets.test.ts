import type { AnalyticsKpis, AnalyticsSummary } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { isEmptyPeriodKpi } from "../src/features/analytics/charts/chart-utils.js";
import {
  busiestCell,
  channelTotal,
  funnelSteps,
  hasUnknownSilentTail,
  rankMetricValue,
  rankRows,
  rate,
  sumHourOfDay,
  sumWeekday,
} from "../src/features/overview/widgets/charts/aggregate.js";
import {
  accessDependentKpis,
  buildKpiView,
} from "../src/features/overview/widgets/charts/kpi-view.js";

function comparison(value: number, previous: number | null) {
  return { value, previous };
}

// The exact percent literal (a normal vs. non-breaking space before "%")
// depends on the ICU data of the runtime, not on our formatting logic — so
// these mirror `buildKpiView`'s own formatters instead of a hardcoded string.
const rateFormat = new Intl.NumberFormat("es-MX", {
  style: "percent",
  maximumFractionDigits: 1,
});
const shareFormat = new Intl.NumberFormat("es-MX", {
  style: "percent",
  maximumFractionDigits: 0,
});

function summary(overrides: Partial<AnalyticsSummary> = {}): AnalyticsSummary {
  return {
    source: "analytics_engine",
    days: 7,
    generatedAt: "2026-09-27T00:00:00.000Z",
    activeTouchpoints: 3,
    totals: {
      taps: 100,
      clicks: 20,
      leads: 5,
      channels: { nfc: 60, qr: 30, link: 10 },
    },
    daily: [
      {
        date: "2026-09-25",
        taps: 40,
        clicks: 8,
        leads: 2,
        channels: { nfc: 24, qr: 12, link: 4 },
      },
      {
        date: "2026-09-26",
        taps: 60,
        clicks: 12,
        leads: 3,
        channels: { nfc: 36, qr: 18, link: 6 },
      },
    ],
    hourly: [],
    touchpoints: [],
    ...overrides,
  } as AnalyticsSummary;
}

function kpis(overrides: Partial<AnalyticsKpis> = {}): AnalyticsKpis {
  return {
    taps: comparison(100, 80),
    clicks: comparison(20, 25),
    leads: comparison(5, 5),
    conversionRate: comparison(0.05, 0.0625),
    interactionRate: comparison(0.2, 0.3125),
    dailyAverage: comparison(14.3, 11.4),
    touchpoints: { active: 3, total: 4 },
    reachedTouchpoints: comparison(2, 3),
    peakHour: { hour: 13, share: 0.18, previousHour: 14 },
    topChannel: { channel: "nfc", share: 0.6, previousChannel: "nfc" },
    peakDay: { date: "2026-09-26", taps: 60 },
    ...overrides,
  } as AnalyticsKpis;
}

describe("rate", () => {
  it("divides safely and treats an empty whole as zero", () => {
    expect(rate(5, 20)).toBe(0.25);
    expect(rate(5, 0)).toBe(0);
  });
});

describe("channelTotal", () => {
  it("sums the three channels", () => {
    expect(channelTotal({ nfc: 1, qr: 2, link: 3 })).toBe(6);
  });
});

describe("sumHourOfDay / sumWeekday", () => {
  const matrix = Array.from({ length: 7 }, (_, day) =>
    Array.from({ length: 24 }, (_, hour) => day * 24 + hour),
  );

  it("sums every weekday's value for each hour", () => {
    const hours = sumHourOfDay(matrix);
    expect(hours).toHaveLength(24);
    // hour 0 across all 7 days: 0 + 24 + 48 + 72 + 96 + 120 + 144
    expect(hours[0]).toBe(504);
  });

  it("sums every hour for each weekday", () => {
    const weekdays = sumWeekday(matrix);
    expect(weekdays).toHaveLength(7);
    // day 0: hours 0..23 -> sum = 276
    expect(weekdays[0]).toBe(276);
  });

  it("returns all zeros when there is no matrix", () => {
    expect(sumHourOfDay(undefined)).toEqual(Array(24).fill(0));
    expect(sumWeekday(undefined)).toEqual([]);
  });
});

describe("busiestCell", () => {
  it("finds the single highest cell", () => {
    const matrix = [
      [0, 1],
      [5, 2],
    ];
    expect(busiestCell(matrix)).toEqual({ day: 1, hour: 0, value: 5 });
  });

  it("is null when everything is zero or missing", () => {
    expect(busiestCell([[0, 0]])).toBeNull();
    expect(busiestCell(undefined)).toBeNull();
  });
});

describe("rankRows / rankMetricValue", () => {
  const rows = [
    { id: "a", taps: 10, clicks: 2, leads: 1 },
    { id: "b", taps: 30, clicks: 9, leads: 6 },
    { id: "c", taps: 0, clicks: 0, leads: 0 },
    { id: "d", taps: 5, clicks: 5, leads: 0 },
  ];

  it("drops rows with no activity and sorts by the chosen metric", () => {
    expect(rankRows(rows, "taps", 5).map((r) => r.id)).toEqual(["b", "a", "d"]);
  });

  it("ranks by conversion (leads / taps), not raw leads", () => {
    // b: 6/30 = 0.2, a: 1/10 = 0.1, d: 0/5 = 0 -> b, a, d
    expect(rankRows(rows, "conversion", 5).map((r) => r.id)).toEqual([
      "b",
      "a",
      "d",
    ]);
  });

  it("respects the limit", () => {
    expect(rankRows(rows, "taps", 1)).toHaveLength(1);
  });

  it("computes a single row's metric value", () => {
    expect(
      rankMetricValue({ taps: 10, clicks: 2, leads: 5 }, "conversion"),
    ).toBe(0.5);
    expect(
      rankMetricValue({ taps: 0, clicks: 0, leads: 0 }, "conversion"),
    ).toBe(0);
    expect(rankMetricValue({ taps: 10, clicks: 2, leads: 5 }, "clicks")).toBe(
      2,
    );
  });
});

describe("hasUnknownSilentTail (A9-23)", () => {
  it("is false with no cut at all", () => {
    expect(hasUnknownSilentTail(0, [5, 2, 0])).toBe(false);
    expect(hasUnknownSilentTail(undefined, [5, 2, 0])).toBe(false);
  });

  it("is false when the list's own lowest row is already zero", () => {
    // Sorted taps desc before the cut (A9-23): if the last one shown has
    // zero, everything past it (lower still) is zero too.
    expect(hasUnknownSilentTail(3, [40, 5, 0])).toBe(false);
  });

  it("is true when there was a cut and the lowest shown still had taps", () => {
    expect(hasUnknownSilentTail(1, [40, 5, 2])).toBe(true);
  });

  it("treats an empty shown list as a (safe) zero lowest", () => {
    expect(hasUnknownSilentTail(5, [])).toBe(false);
  });
});

describe("isEmptyPeriodKpi (A9-29)", () => {
  it("is true only at zero, with no trend and no other detail", () => {
    expect(
      isEmptyPeriodKpi({ hasTrend: false, hasDetail: false, numericValue: 0 }),
    ).toBe(true);
  });

  it("is false once there is a trend to show, even at zero", () => {
    expect(
      isEmptyPeriodKpi({ hasTrend: true, hasDetail: false, numericValue: 0 }),
    ).toBe(false);
  });

  it("is false once there is a detail line already", () => {
    expect(
      isEmptyPeriodKpi({ hasTrend: false, hasDetail: true, numericValue: 0 }),
    ).toBe(false);
  });

  it("is false for a nonzero value", () => {
    expect(
      isEmptyPeriodKpi({ hasTrend: false, hasDetail: false, numericValue: 5 }),
    ).toBe(false);
  });

  it("is false while the value itself is unknown", () => {
    expect(
      isEmptyPeriodKpi({
        hasTrend: false,
        hasDetail: false,
        numericValue: undefined,
      }),
    ).toBe(false);
  });
});

describe("funnelSteps", () => {
  it("computes each step's share of the first and of the previous step", () => {
    const steps = funnelSteps({ taps: 100, clicks: 20, leads: 5 });
    expect(steps.map((s) => s.key)).toEqual(["taps", "clicks", "leads"]);
    expect(steps[0]?.shareOfFirst).toBe(1);
    expect(steps[0]?.shareOfPrevious).toBeNull();
    expect(steps[1]?.shareOfFirst).toBeCloseTo(0.2);
    expect(steps[1]?.shareOfPrevious).toBeCloseTo(0.2);
    expect(steps[2]?.shareOfFirst).toBeCloseTo(0.05);
    expect(steps[2]?.shareOfPrevious).toBeCloseTo(0.25);
  });

  it("never reports more than 100% even with noisy data", () => {
    const steps = funnelSteps({ taps: 10, clicks: 15, leads: 20 });
    for (const step of steps) {
      expect(step.shareOfFirst).toBeLessThanOrEqual(1);
      if (step.shareOfPrevious !== null)
        expect(step.shareOfPrevious).toBeLessThanOrEqual(1);
    }
  });

  it("is all zero shares when there are no accesses", () => {
    const steps = funnelSteps({ taps: 0, clicks: 0, leads: 0 });
    expect(steps.every((s) => s.shareOfFirst === 0)).toBe(true);
  });
});

describe("accessDependentKpis", () => {
  it("keeps leads and activeTouchpoints working without the engine", () => {
    expect(accessDependentKpis.has("leads")).toBe(false);
    expect(accessDependentKpis.has("activeTouchpoints")).toBe(false);
  });

  it("flags every other metric as depending on taps/clicks", () => {
    for (const metric of [
      "taps",
      "clicks",
      "conversionRate",
      "interactionRate",
      "dailyAverage",
      "reachedTouchpoints",
      "peakHour",
      "topChannel",
      "peakDay",
    ] as const) {
      expect(accessDependentKpis.has(metric)).toBe(true);
    }
  });
});

describe("buildKpiView", () => {
  it("returns null when the summary has no computed kpis", () => {
    expect(buildKpiView("taps", summary(), true)).toBeNull();
  });

  it("formats a count metric with its trend and daily sparkline", () => {
    const view = buildKpiView("taps", summary({ kpis: kpis() }), true);
    expect(view).not.toBeNull();
    expect(view?.value).toBe("100");
    expect(view?.numericValue).toBe(100);
    expect(view?.trendPercent).toBeCloseTo(25); // (100-80)/80*100
    expect(view?.sparkline).toEqual([40, 60]);
  });

  it("formats a rate metric as a percent and derives its daily series", () => {
    const view = buildKpiView(
      "conversionRate",
      summary({ kpis: kpis() }),
      true,
    );
    expect(view?.value).toBe(rateFormat.format(0.05));
    // day 1: 2/40 = 0.05, day 2: 3/60 = 0.05
    expect(view?.sparkline).toEqual([0.05, 0.05]);
  });

  it("has no trend for the composite active/total touchpoints reading", () => {
    const view = buildKpiView(
      "activeTouchpoints",
      summary({ kpis: kpis() }),
      true,
    );
    expect(view?.value).toBe("3 / 4");
    expect(view?.trendPercent).toBeNull();
    expect(view?.sparkline).toBeUndefined();
  });

  it("falls back to an em dash when peakHour/topChannel/peakDay are unknown", () => {
    const withoutActivity = summary({
      kpis: kpis({
        peakHour: { hour: null, share: 0, previousHour: null },
        topChannel: { channel: null, share: 0, previousChannel: null },
        peakDay: { date: null, taps: 0 },
      }),
    });
    expect(buildKpiView("peakHour", withoutActivity, true)?.value).toBe("—");
    expect(buildKpiView("topChannel", withoutActivity, true)?.value).toBe("—");
    expect(buildKpiView("peakDay", withoutActivity, true)?.value).toBe("—");
  });

  it("reads the peak hour, top channel and peak day as the brief expects", () => {
    const data = summary({ kpis: kpis() });
    expect(buildKpiView("peakHour", data, true)?.value).toBe("13:00");
    expect(buildKpiView("peakHour", data, true)?.detail).toBe(
      `${shareFormat.format(0.18)} de los accesos`,
    );
    expect(buildKpiView("topChannel", data, true)?.value).toBe("NFC");
    expect(buildKpiView("peakDay", data, true)?.value).toMatch(/sep/);
  });

  it("omits the sparkline when the toggle is off", () => {
    const view = buildKpiView("taps", summary({ kpis: kpis() }), false);
    expect(view?.sparkline).toBeUndefined();
  });
});
