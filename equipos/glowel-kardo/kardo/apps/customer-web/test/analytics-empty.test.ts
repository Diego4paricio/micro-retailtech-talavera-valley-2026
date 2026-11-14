import type { AnalyticsSummary } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { analyticsEmptyKind } from "../src/features/analytics/analytics-empty.js";

function summary(
  totals: Partial<AnalyticsSummary["totals"]> = {},
  source: AnalyticsSummary["source"] = "analytics_engine",
): Pick<AnalyticsSummary, "source" | "totals"> {
  return {
    source,
    totals: {
      taps: 0,
      clicks: 0,
      leads: 0,
      channels: { nfc: 0, qr: 0, link: 0 },
      ...totals,
    },
  };
}

describe("analyticsEmptyKind (A9-29)", () => {
  it("is null while the data has not loaded yet", () => {
    expect(analyticsEmptyKind(null, [], [])).toBeNull();
  });

  it("is null when Analytics Engine did not answer (not a real empty period)", () => {
    expect(analyticsEmptyKind(summary({}, "unavailable"), [], [])).toBeNull();
  });

  it("is null once the period has any accesses, clicks or requests", () => {
    expect(analyticsEmptyKind(summary({ taps: 1 }), [], [])).toBeNull();
    expect(analyticsEmptyKind(summary({ clicks: 1 }), [], [])).toBeNull();
    expect(analyticsEmptyKind(summary({ leads: 1 }), [], [])).toBeNull();
  });

  it("is «unpublished» when nothing is live anywhere", () => {
    expect(
      analyticsEmptyKind(
        summary(),
        [{ status: "paused" }, { status: "retired" }],
        [{ liveTouchpointCount: 0 }],
      ),
    ).toBe("unpublished");
  });

  it("is «noVisits» once a Touchpoint is active, even with zero visits", () => {
    expect(analyticsEmptyKind(summary(), [{ status: "active" }], [])).toBe(
      "noVisits",
    );
  });

  it("is «noVisits» once an Experience is live on some Touchpoint", () => {
    expect(
      analyticsEmptyKind(summary(), [], [{ liveTouchpointCount: 2 }]),
    ).toBe("noVisits");
  });
});
