import type { PublicStatusIncident } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  advanceProbe,
  computeStatus,
  nextProbeLevel,
  type ProbeState,
  summarizeHistory,
} from "../src/compute.js";
import type { ProbeResult, Signal } from "../src/probes.js";
import type { ProviderResult } from "../src/providers.js";

const now = new Date("2026-10-03T18:00:00.000Z");

function result(id: ProbeResult["id"], signal: Signal | null): ProbeResult {
  return {
    id,
    configured: signal !== null,
    signal,
    ok: signal === null ? null : signal === "operational",
    slow: false,
    latencyMs: 10,
    httpStatus: 200,
    error: null,
    detail: null,
    checkedAt: now.toISOString(),
  };
}

function state(id: ProbeResult["id"], level: Signal): ProbeState {
  return { id, level, signals: [level, level], last: null };
}

describe("nextProbeLevel", () => {
  it("needs two equal signals in a row to move", () => {
    expect(nextProbeLevel("operational", ["operational", "major_outage"])).toBe(
      "operational",
    );
    expect(
      nextProbeLevel("operational", ["major_outage", "major_outage"]),
    ).toBe("major_outage");
    expect(
      nextProbeLevel("major_outage", ["major_outage", "operational"]),
    ).toBe("major_outage");
    expect(nextProbeLevel("major_outage", ["operational", "operational"])).toBe(
      "operational",
    );
  });

  it("calls a check that keeps flipping degraded", () => {
    expect(
      nextProbeLevel("operational", [
        "major_outage",
        "operational",
        "major_outage",
        "operational",
        "major_outage",
      ]),
    ).toBe("degraded");
  });
});

describe("advanceProbe", () => {
  it("one blip does not paint it red; two do", () => {
    let current = advanceProbe(undefined, result("resolver", "operational"));
    current = advanceProbe(current, result("resolver", "major_outage"));
    expect(current.level).toBe("operational");
    current = advanceProbe(current, result("resolver", "major_outage"));
    expect(current.level).toBe("major_outage");
    current = advanceProbe(current, result("resolver", "operational"));
    expect(current.level).toBe("major_outage");
    current = advanceProbe(current, result("resolver", "operational"));
    expect(current.level).toBe("operational");
  });

  it("an unknown answer keeps the level; an unconfigured check resets", () => {
    const failing = state("queue", "partial_outage");
    const unknown = { ...result("queue", null), configured: true };
    expect(advanceProbe(failing, unknown).level).toBe("partial_outage");
    expect(advanceProbe(failing, result("queue", null)).level).toBe(
      "operational",
    );
  });
});

const providerIssue = (
  level: Signal,
  components: ProviderResult["issues"][number]["components"],
): ProviderResult => ({
  provider: "cloudflare",
  ok: true,
  checkedAt: now.toISOString(),
  error: null,
  issues: [{ name: "Workers", level, components }],
});

const incident = (
  overrides: Partial<PublicStatusIncident>,
): PublicStatusIncident => ({
  id: "7b9e2c1a-4d3f-4a5b-8c6d-1e2f3a4b5c6d",
  kind: "incident",
  title: "Falla",
  impact: "degraded",
  components: ["files"],
  startsAt: "2026-10-03T17:00:00.000Z",
  endsAt: null,
  resolvedAt: null,
  updates: [],
  ...overrides,
});

describe("computeStatus", () => {
  it("is all operational with nothing to say", () => {
    const status = computeStatus({
      probes: [],
      providers: [],
      incidents: [],
      checkedAt: null,
      now,
    });
    expect(status.overall).toBe("operational");
    expect(status.components).toHaveLength(6);
    expect(status.components.every((c) => !c.provider)).toBe(true);
  });

  it("an API outage takes the panel, publishing and the AI", () => {
    const status = computeStatus({
      probes: [state("api", "major_outage")],
      providers: [],
      incidents: [],
      checkedAt: now.toISOString(),
      now,
    });
    const levels = Object.fromEntries(
      status.components.map((c) => [c.id, c.level]),
    );
    expect(levels).toMatchObject({
      panel: "major_outage",
      publishing: "major_outage",
      ai: "major_outage",
      pages: "operational",
    });
    expect(status.overall).toBe("major_outage");
  });

  it("marks areas set by a provider alone", () => {
    const status = computeStatus({
      probes: [state("resolver", "operational")],
      providers: [providerIssue("partial_outage", ["pages"])],
      incidents: [],
      checkedAt: null,
      now,
    });
    const pages = status.components.find((c) => c.id === "pages");
    expect(pages).toEqual({
      id: "pages",
      level: "partial_outage",
      provider: true,
      measured: true,
    });
  });

  it("our own outage wins over the provider's and is not called a provider issue", () => {
    const status = computeStatus({
      probes: [state("resolver", "major_outage")],
      providers: [providerIssue("partial_outage", ["pages"])],
      incidents: [],
      checkedAt: null,
      now,
    });
    expect(status.components.find((c) => c.id === "pages")).toEqual({
      id: "pages",
      level: "major_outage",
      provider: false,
      measured: true,
    });
  });

  it("says an area no configured check covers was not measured (A2-69)", () => {
    const unconfigured = advanceProbe(undefined, {
      id: "resolver",
      configured: false,
      signal: null,
      ok: null,
      slow: false,
      latencyMs: null,
      httpStatus: null,
      error: null,
      detail: null,
      checkedAt: now.toISOString(),
    });
    const status = computeStatus({
      probes: [unconfigured],
      providers: [],
      incidents: [],
      checkedAt: now.toISOString(),
      now,
    });
    const pages = status.components.find((c) => c.id === "pages");
    expect(pages?.level).toBe("operational");
    expect(pages?.measured).toBe(false);
  });

  it("adds open incidents and maintenance in progress, lists upcoming ones", () => {
    const status = computeStatus({
      probes: [],
      providers: [],
      incidents: [
        incident({}),
        incident({
          id: "8c0f3d2b-5e4a-4b6c-9d7e-2f3a4b5c6d7e",
          kind: "maintenance",
          impact: "maintenance",
          components: ["panel"],
          startsAt: "2026-10-03T17:30:00.000Z",
          endsAt: "2026-10-03T19:00:00.000Z",
        }),
        incident({
          id: "9d1a4e3c-6f5b-4c7d-8e9f-3a4b5c6d7e8f",
          kind: "maintenance",
          impact: "maintenance",
          components: ["publishing"],
          startsAt: "2026-10-05T08:00:00.000Z",
          endsAt: "2026-10-05T09:00:00.000Z",
        }),
        incident({
          id: "0e2b5f4d-7a6c-4d8e-9f0a-4b5c6d7e8f90",
          resolvedAt: "2026-10-03T17:50:00.000Z",
          components: ["ai"],
          impact: "major_outage",
        }),
      ],
      checkedAt: null,
      now,
    });
    const levels = Object.fromEntries(
      status.components.map((c) => [c.id, c.level]),
    );
    expect(levels).toMatchObject({
      files: "degraded",
      panel: "maintenance",
      publishing: "operational",
      ai: "operational",
    });
    expect(status.incidents).toHaveLength(2);
    expect(status.upcoming.map((i) => i.components)).toEqual([["publishing"]]);
    expect(status.overall).toBe("degraded");
  });

  it("a maintenance past its end is no longer shown", () => {
    const status = computeStatus({
      probes: [],
      providers: [],
      incidents: [
        incident({
          kind: "maintenance",
          impact: "maintenance",
          startsAt: "2026-10-03T10:00:00.000Z",
          endsAt: "2026-10-03T11:00:00.000Z",
        }),
      ],
      checkedAt: null,
      now,
    });
    expect(status.overall).toBe("operational");
    expect(status.incidents).toEqual([]);
  });
});

describe("summarizeHistory", () => {
  it("keeps the worst level of each area per day", () => {
    const days = summarizeHistory([
      {
        day: "2026-10-02",
        component: "pages",
        level: "operational",
        minutes: 1400,
      },
      {
        day: "2026-10-02",
        component: "pages",
        level: "major_outage",
        minutes: 3,
      },
      {
        day: "2026-10-03",
        component: "panel",
        level: "maintenance",
        minutes: 60,
      },
    ]);
    expect(days).toHaveLength(2);
    expect(days[0]?.components.pages).toBe("major_outage");
    expect(days[0]?.components.panel).toBe("operational");
    expect(days[1]?.components.panel).toBe("maintenance");
  });
});
