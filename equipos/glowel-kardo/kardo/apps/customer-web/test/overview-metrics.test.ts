import type { AnalyticsSummary } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  decodeScope,
  encodeScope,
  touchpointsInScope,
  validScope,
} from "../src/features/overview/filters.js";
import { describePeriod } from "../src/features/overview/metrics.js";
import { summaryKey } from "../src/features/overview/summary-store.js";

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

function summary(overrides: Partial<AnalyticsSummary> = {}): AnalyticsSummary {
  const weekdayHour = Array.from({ length: 7 }, () =>
    Array<number>(24).fill(0),
  );
  (weekdayHour[0] as number[])[13] = 6;
  (weekdayHour[2] as number[])[13] = 2;
  (weekdayHour[4] as number[])[9] = 4;
  return {
    source: "analytics_engine",
    days: 7,
    generatedAt: "2026-09-27T20:00:00.000Z",
    activeTouchpoints: 2,
    previous: { taps: 50, clicks: 10, leads: 5 },
    weekdayHour,
    totals: {
      taps: 100,
      clicks: 30,
      leads: 8,
      channels: { nfc: 20, qr: 70, link: 10 },
    },
    daily: [
      {
        date: "2026-09-21",
        taps: 40,
        clicks: 10,
        leads: 4,
        channels: { nfc: 0, qr: 0, link: 0 },
      },
      {
        date: "2026-09-27",
        taps: 60,
        clicks: 20,
        leads: 4,
        channels: { nfc: 0, qr: 0, link: 0 },
      },
    ],
    hourly: [],
    touchpoints: [
      {
        touchpointId: id(1),
        name: "Mesa 1",
        kind: "qr",
        taps: 100,
        clicks: 30,
        leads: 8,
        channels: { nfc: 20, qr: 70, link: 10 },
      },
      {
        touchpointId: id(2),
        name: "Mesa 2",
        kind: "qr",
        taps: 0,
        clicks: 0,
        leads: 0,
        channels: { nfc: 0, qr: 0, link: 0 },
      },
    ],
    ...overrides,
  };
}

describe("describePeriod", () => {
  it("names the calendar range and the comparison", () => {
    expect(describePeriod(summary())).toBe(
      "Del 21 al 27 de septiembre, comparado con los 7 días anteriores.",
    );
    const across = summary({
      days: 30,
      daily: [
        {
          date: "2026-08-29",
          taps: 0,
          clicks: 0,
          channels: { nfc: 0, qr: 0, link: 0 },
        },
        {
          date: "2026-09-27",
          taps: 0,
          clicks: 0,
          channels: { nfc: 0, qr: 0, link: 0 },
        },
      ],
    });
    expect(describePeriod(across)).toBe(
      "Del 29 de agosto al 27 de septiembre, comparado con los 30 días anteriores.",
    );
  });
});

describe("scope filters", () => {
  const touchpoints = [
    { id: id(1), status: "active", groupId: id(7) },
    { id: id(2), status: "paused", groupId: id(8) },
    { id: id(3), status: "retired", groupId: id(7) },
  ] as Parameters<typeof touchpointsInScope>[1];

  it("round-trips the encoded scope", () => {
    for (const scope of [
      { kind: "all" as const },
      { kind: "group" as const, id: id(7) },
      { kind: "touchpoint" as const, id: id(1) },
    ]) {
      expect(decodeScope(encodeScope(scope))).toEqual(scope);
    }
    expect(decodeScope("garbage")).toEqual({ kind: "all" });
  });

  it("falls back to the whole workspace when the target is gone", () => {
    expect(validScope({ kind: "group", id: id(9) }, [], touchpoints)).toEqual({
      kind: "all",
    });
    expect(
      validScope({ kind: "touchpoint", id: id(3) }, [], touchpoints),
    ).toEqual({ kind: "all" });
    // Until the lists load, a saved scope is kept.
    const saved = { kind: "group" as const, id: id(9) };
    expect(validScope(saved, null, null)).toBe(saved);
  });

  it("covers the scope's Touchpoints without retired ones", () => {
    expect(
      touchpointsInScope({ kind: "group", id: id(7) }, touchpoints).map(
        (item) => item.id,
      ),
    ).toEqual([id(1)]);
    expect(touchpointsInScope({ kind: "all" }, touchpoints)).toHaveLength(2);
  });

  it("keys the cache by workspace, period and scope", () => {
    expect(summaryKey("w", { days: 7, scope: { kind: "all" } })).not.toBe(
      summaryKey("w", { days: 30, scope: { kind: "all" } }),
    );
    expect(
      summaryKey("w", { days: 7, scope: { kind: "group", id: id(7) } }),
    ).not.toBe(
      summaryKey("w", { days: 7, scope: { kind: "touchpoint", id: id(7) } }),
    );
  });

  it("keys the cache by the chosen zone too (A9-25)", () => {
    const base = { days: 7 as const, scope: { kind: "all" as const } };
    expect(
      summaryKey("w", { ...base, timeZone: "America/Mexico_City" }),
    ).not.toBe(summaryKey("w", { ...base, timeZone: "Europe/Madrid" }));
    // Same zone, same key: switching back to it reuses the cached answer.
    expect(summaryKey("w", { ...base, timeZone: "Europe/Madrid" })).toBe(
      summaryKey("w", { ...base, timeZone: "Europe/Madrid" }),
    );
    // No zone at all is its own, distinct key (never confused with one).
    expect(summaryKey("w", base)).not.toBe(
      summaryKey("w", { ...base, timeZone: "Europe/Madrid" }),
    );
  });
});
