import { describe, expect, it, vi } from "vitest";
import { createPostgresStaffMetricsRepository } from "../src/repositories/metrics.js";
import { staffIdentity } from "./fixtures.js";

function runQuery(strings: TemplateStringsArray) {
  const text = strings.join(" ");
  if (text.includes("select exists(")) {
    return Promise.resolve([{ granted: true }]);
  }
  // Checked before the totals branch below: "new_customers," is itself a
  // substring match for "customers,", so the more specific marker must win.
  if (text.includes("new_customers,")) {
    return Promise.resolve([
      {
        new_customers: 3,
        new_workspaces: 1,
        new_touchpoints: 4,
        publications: 6,
        leads: 9,
        previous_new_customers: 2,
        previous_new_touchpoints: 3,
        previous_publications: 5,
        previous_leads: 7,
      },
    ]);
  }
  if (text.includes("customers,")) {
    return Promise.resolve([
      {
        customers: 10,
        workspaces: 5,
        organizations: 1,
        touchpoints: 20,
        active_touchpoints: 15,
        suspended_touchpoints: 1,
        experiences: 8,
        live_experiences: 6,
        leads: 40,
        pending_publications: 2,
        failed_publications_last_24_hours: 0,
        succeeded_publications_period: 5,
        failed_publications_period: 1,
        pending_publications_period: 2,
        median_publish_seconds: 120,
      },
    ]);
  }
  return Promise.resolve([]);
}

function makeFakeSql() {
  const tag = (strings: TemplateStringsArray) => runQuery(strings);
  tag.unsafe = () => Promise.resolve([]);
  tag.json = (value: unknown) => value;
  tag.begin = (fn: (tx: typeof tag) => Promise<unknown>) => fn(tag);
  return tag;
}

describe("StaffMetricsRepository.getOverview", () => {
  it("returns taps: null and warns, without failing the request, when Analytics Engine fails", async () => {
    const analyticsEngine = {
      query: vi.fn().mockRejectedValue(new Error("Analytics Engine is down")),
    };
    const repository = createPostgresStaffMetricsRepository(
      // biome-ignore lint/suspicious/noExplicitAny: minimal fake for postgres.js's tagged-template Sql type
      makeFakeSql() as any,
      analyticsEngine,
      "kardo_taps",
      "test",
    );
    const onWarning = vi.fn();

    const overview = await repository.getOverview(
      staffIdentity.subject,
      30,
      onWarning,
    );

    expect(overview.taps).toBeNull();
    expect(overview.totals.customers).toBe(10);
    expect(overview.publicationHealth.medianSeconds).toBe(120);
    expect(onWarning).toHaveBeenCalledOnce();
  });

  it("returns taps: null without warning when Analytics Engine is not configured", async () => {
    const repository = createPostgresStaffMetricsRepository(
      // biome-ignore lint/suspicious/noExplicitAny: minimal fake for postgres.js's tagged-template Sql type
      makeFakeSql() as any,
      null,
      "kardo_taps",
      "test",
    );
    const onWarning = vi.fn();

    const overview = await repository.getOverview(
      staffIdentity.subject,
      30,
      onWarning,
    );

    expect(overview.taps).toBeNull();
    expect(onWarning).not.toHaveBeenCalled();
  });
});
