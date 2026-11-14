import type { DashboardLayout } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { buildKpis } from "../src/analytics-kpis.js";
import { buildCustomerApi } from "../src/app.js";
import { WorkspaceAccessError } from "../src/errors.js";
import {
  type DashboardRepository,
  sanitizeDashboardLayout,
} from "../src/repositories/dashboard.js";
import { authHeader, subjectId, verifierFor, workspaceId } from "./helpers.js";

const layout: DashboardLayout = {
  version: 1,
  widgets: [
    {
      id: "kpi-taps",
      type: "kpi",
      x: 0,
      y: 0,
      w: 3,
      h: 2,
      config: { metric: "taps" },
    },
    {
      id: "trend",
      type: "trend",
      x: 0,
      y: 2,
      w: 8,
      h: 4,
      config: { metric: "clicks", compare: true },
    },
  ],
};

function memoryRepository(): DashboardRepository & {
  saved: Map<string, DashboardLayout>;
} {
  const saved = new Map<string, DashboardLayout>();
  return {
    saved,
    getLayout: async (identity, id) => {
      const value = saved.get(`${identity.subject}:${id}`);
      return {
        layout: value ?? null,
        updatedAt: value ? "2026-09-27T20:00:00.000Z" : null,
      };
    },
    saveLayout: async (identity, id, value) => {
      const clean = sanitizeDashboardLayout(value, 12);
      saved.set(`${identity.subject}:${id}`, clean);
      return { layout: clean, updatedAt: "2026-09-27T20:00:00.000Z" };
    },
    resetLayout: async (identity, id) => {
      saved.delete(`${identity.subject}:${id}`);
    },
  };
}

describe("dashboard layout routes", () => {
  it("returns null until the member saves, then their layout", async () => {
    const repository = memoryRepository();
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      dashboardRepository: repository,
    });
    const url = `/v1/workspaces/${workspaceId}/dashboard`;
    const empty = await app.inject({ method: "GET", url, headers: authHeader });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({ layout: null, updatedAt: null });

    const put = await app.inject({
      method: "PUT",
      url,
      headers: authHeader,
      payload: { layout },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().layout.widgets).toHaveLength(2);
    expect(repository.saved.has(`${subjectId}:${workspaceId}`)).toBe(true);

    const reset = await app.inject({
      method: "DELETE",
      url,
      headers: authHeader,
    });
    expect(reset.statusCode).toBe(204);
    expect(repository.saved.size).toBe(0);
    await app.close();
  });

  it("rejects malformed layouts before they reach storage", async () => {
    const repository = memoryRepository();
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      dashboardRepository: repository,
    });
    const url = `/v1/workspaces/${workspaceId}/dashboard`;
    const widget = layout.widgets[0];
    const bad = [
      { version: 2, widgets: [] },
      { version: 1, widgets: [{ ...widget, x: 12 }] },
      { version: 1, widgets: [{ ...widget, w: 13 }] },
      { version: 1, widgets: [{ ...widget, id: "Bad Id!" }] },
      { version: 1, widgets: [{ ...widget, type: "<script>" }] },
      { version: 1, widgets: [{ ...widget, config: { nested: { a: 1 } } }] },
      {
        version: 1,
        widgets: [{ ...widget, config: { note: "x".repeat(61) } }],
      },
      {
        version: 1,
        widgets: Array.from({ length: 41 }, (_, index) => ({
          ...widget,
          id: `w-${index}`,
        })),
      },
    ];
    for (const candidate of bad) {
      const response = await app.inject({
        method: "PUT",
        url,
        headers: authHeader,
        payload: { layout: candidate },
      });
      expect(response.statusCode).toBe(400);
    }
    expect(repository.saved.size).toBe(0);

    // Unknown fields are stripped by the schema, never stored.
    const extra = await app.inject({
      method: "PUT",
      url,
      headers: authHeader,
      payload: {
        layout: { version: 1, widgets: [{ ...widget, extra: true }] },
      },
    });
    expect(extra.statusCode).toBe(200);
    expect(
      repository.saved.get(`${subjectId}:${workspaceId}`)?.widgets[0],
    ).not.toHaveProperty("extra");
    await app.close();
  });

  it("does not reveal another workspace's layout", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      dashboardRepository: {
        getLayout: async () => {
          throw new WorkspaceAccessError();
        },
        saveLayout: async () => {
          throw new WorkspaceAccessError();
        },
        resetLayout: async () => {
          throw new WorkspaceAccessError();
        },
      },
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/dashboard`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

describe("sanitizeDashboardLayout", () => {
  it("drops duplicate ids and keeps widgets inside the grid", () => {
    const widget = layout.widgets[0] as DashboardLayout["widgets"][number];
    const clean = sanitizeDashboardLayout(
      {
        version: 1,
        widgets: [
          widget,
          { ...widget },
          { ...widget, id: "wide", x: 10, w: 6 },
        ],
      },
      12,
    );
    expect(clean.widgets.map((item) => item.id)).toEqual(["kpi-taps", "wide"]);
    expect(clean.widgets[1]).toMatchObject({ x: 6, w: 6 });
  });
});

describe("buildKpis", () => {
  const base = {
    days: 7,
    current: {
      taps: 100,
      clicks: 25,
      leads: 5,
      channels: { nfc: 20, qr: 70, link: 10 },
    },
    previous: {
      taps: 50,
      clicks: 5,
      leads: 5,
      channels: { nfc: 30, qr: 10, link: 10 },
    },
    previousLeads: 5,
    daily: [
      { date: "2026-09-21", taps: 30 },
      { date: "2026-09-22", taps: 70 },
    ],
    hoursOfDay: Array.from({ length: 24 }, (_, hour) =>
      hour === 13 ? 40 : hour === 9 ? 10 : 0,
    ),
    previousHoursOfDay: Array.from({ length: 24 }, (_, hour) =>
      hour === 18 ? 5 : 0,
    ),
    touchpoints: { active: 4, total: 5 },
    reached: 3,
    previousReached: 2,
  };

  it("derives every indicator with its previous value", () => {
    const kpis = buildKpis(base);
    expect(kpis.taps).toEqual({ value: 100, previous: 50 });
    expect(kpis.conversionRate).toEqual({ value: 0.05, previous: 0.1 });
    expect(kpis.interactionRate).toEqual({ value: 0.25, previous: 0.1 });
    expect(kpis.dailyAverage.value).toBeCloseTo(100 / 7);
    expect(kpis.reachedTouchpoints).toEqual({ value: 3, previous: 2 });
    expect(kpis.peakHour).toEqual({ hour: 13, share: 0.8, previousHour: 18 });
    expect(kpis.topChannel).toEqual({
      channel: "qr",
      share: 0.7,
      previousChannel: "nfc",
    });
    expect(kpis.peakDay).toEqual({ date: "2026-09-22", taps: 70 });
  });

  it("has no previous engine values when Analytics Engine did not answer", () => {
    const kpis = buildKpis({
      ...base,
      previous: null,
      previousHoursOfDay: null,
      previousReached: null,
    });
    expect(kpis.taps.previous).toBeNull();
    expect(kpis.conversionRate.previous).toBeNull();
    expect(kpis.leads.previous).toBe(5);
    expect(kpis.topChannel.previousChannel).toBeNull();
  });

  it("reports nothing to point at when there were no taps", () => {
    const kpis = buildKpis({
      ...base,
      current: {
        taps: 0,
        clicks: 0,
        leads: 0,
        channels: { nfc: 0, qr: 0, link: 0 },
      },
      daily: [{ date: "2026-09-21", taps: 0 }],
      hoursOfDay: Array<number>(24).fill(0),
    });
    expect(kpis.peakHour.hour).toBeNull();
    expect(kpis.topChannel.channel).toBeNull();
    expect(kpis.peakDay.date).toBeNull();
    expect(kpis.conversionRate.value).toBe(0);
  });
});
