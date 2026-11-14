import { describe, expect, it } from "vitest";
import {
  sampleSummary,
  sampleWidgetContext,
} from "../src/features/overview/dashboard/sample-data.js";

describe("gallery sample data", () => {
  it("covers the requested period with a comparable previous one", () => {
    for (const days of [7, 30, 90] as const) {
      const summary = sampleSummary(days);
      expect(summary.daily).toHaveLength(days);
      expect(summary.previousDaily).toHaveLength(days);
      expect(summary.hourly).toHaveLength(24);
      expect(summary.weekdayHour).toHaveLength(7);
      expect(summary.weekdayHour?.every((row) => row.length === 24)).toBe(true);
    }
  });

  it("is internally consistent, so every widget tells the same story", () => {
    const summary = sampleSummary(30);
    const daily = (key: "taps" | "clicks" | "leads") =>
      summary.daily.reduce((sum, day) => sum + (day[key] ?? 0), 0);
    expect(summary.totals.taps).toBe(daily("taps"));
    expect(summary.totals.clicks).toBe(daily("clicks"));
    expect(summary.totals.leads).toBe(daily("leads"));
    const { nfc, qr, link } = summary.totals.channels;
    expect(nfc + qr + link).toBe(summary.totals.taps);
    expect(summary.touchpoints.reduce((sum, item) => sum + item.taps, 0)).toBe(
      summary.totals.taps,
    );
    expect(summary.kpis?.taps.value).toBe(summary.totals.taps);
    expect(summary.kpis?.peakHour.hour).not.toBeNull();
  });

  it("includes an active Touchpoint nobody opened (for Sin accesos)", () => {
    const context = sampleWidgetContext(7);
    const silent = context.touchpoints.filter(
      (touchpoint) =>
        touchpoint.status === "active" &&
        !context.data.touchpoints.find(
          (item) => item.touchpointId === touchpoint.id && item.taps > 0,
        ),
    );
    expect(silent.length).toBeGreaterThan(0);
    expect(context.groups.length).toBeGreaterThan(0);
    expect(context.experiences.length).toBeGreaterThan(0);
    expect(sampleWidgetContext(7)).toBe(context);
  });
});
