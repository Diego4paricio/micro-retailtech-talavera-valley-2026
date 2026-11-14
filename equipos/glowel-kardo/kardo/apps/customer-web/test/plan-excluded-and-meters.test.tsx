import type { WorkspaceBilling } from "@kardo/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UsageMeters } from "../src/features/billing/UsageMeters.js";
import { touchpointBadge } from "../src/features/touchpoints/labels.js";

describe("«Fuera del plan» (ADR 023, downgrade option B)", () => {
  it("marks a Touchpoint left out of the plan", () => {
    expect(touchpointBadge({ status: "active", planExcluded: true })).toEqual({
      label: "Fuera del plan",
      tone: "warning",
    });
  });

  it("keeps Kardo's suspension and a retirement first", () => {
    expect(
      touchpointBadge({ status: "active", suspended: true, planExcluded: true })
        .label,
    ).toBe("Suspendido por Kardo");
    expect(
      touchpointBadge({ status: "retired", planExcluded: true }).label,
    ).not.toBe("Fuera del plan");
  });
});

describe("Consumo y límites", () => {
  const billing = (entitlements: Record<string, unknown>) =>
    ({
      entitlements,
      usage: { "touchpoints.max": 12, "links.max": 1 },
    }) as unknown as WorkspaceBilling;

  it("fills the bar against the plan's limit", () => {
    const html = renderToStaticMarkup(
      <UsageMeters billing={billing({ "touchpoints.max": 60 })} />,
    );
    expect(html).toContain("12 de 60");
    expect(html).toContain("billing-meter-fill");
  });

  it("draws an open bar, with the number in use, when there is no limit", () => {
    const html = renderToStaticMarkup(<UsageMeters billing={billing({})} />);
    expect(html).toContain("12 en uso");
    expect(html).toContain("billing-meter-track-open");
    expect(html).toContain("Sin límite en tu plan");
    expect(html).not.toContain("billing-meter-fill");
  });
});
